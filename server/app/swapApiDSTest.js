import moment from 'moment';
import helper from '../utils/index';
const customAuthClientBN = require('./customAuthClientBN');

const express = require('express');
const app = express();

app.all('*', function (req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'X-Requested-With');
	res.header('Access-Control-Allow-Headers', 'content-type');
	res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');
	res.header('X-Powered-By', ' 3.2.1');
	res.header('Content-Type', 'application/json;charset=utf-8');
	if (req.method.toLowerCase() == 'options') res.send(200);
	//让options尝试请求快速结束
	else next();
});

const configBN = require('./configBN2');
const cAuthClientBN = new customAuthClientBN(
	configBN.httpkey,
	configBN.httpsecret,
	configBN.urlHost
);

const ccxt = require('ccxt');
const tulind = require('tulind');
// const { SMA, STDDEV } = require('tulind/indicators');

// 0. 环境配置
const exchange = new ccxt.binance({
	enableRateLimit: true,
});
const symbol = 'DOGE/USDT';
const timeframe = '1m';
const since = exchange.parse8601('2023-01-01T00:00:00Z');

// 配置参数
const config = {
	stopLoss: 0.008, // 硬止损(0.5%)
	takeProfit: 0.015, // 硬止盈(1%)
	emaSettings: {
		periods: { '15m': [13, 34], '5m': [5, 21], '1m': [3, 8] },
		slopeThreshold: 0.1 / 100, // EMA斜率阈值
	},
	atrSettings: {
		period: 7,
		stopLossMultiplier: 1.5,
		takeProfitMultiplier: 2.5,
	},
};
const marketData = {
	'30m': [],
	'5m': [],
	'1m': [],
};
const dataWithIndicatorsMap = {
	'30m': [],
	'5m': [],
	'1m': [],
};

// 1. 获取历史数据
async function fetchOHLCV(tf, num) {
	try {
		let allCandles = [];
		let sinceParam = since;

		while (true) {
			const candles = await exchange.fetch_ohlcv(symbol, tf, sinceParam);
			if (!candles.length) break;
			sinceParam = candles[candles.length - 1][0] + 1;
			allCandles = allCandles.concat(candles);
			if (allCandles.length > num) break; // 控制数据量
		}
		return allCandles.map((c) => ({
			timestamp: c[0],
			open: c[1],
			high: c[2],
			low: c[3],
			close: c[4],
			volume: c[5],
		}));
	} catch (e) {
		console.error('获取数据失败:', e);
		return [];
	}
}

async function calculateSingleEMA(period, data) {
	return new Promise((resolve) => {
		tulind.indicators.ema.indicator([data], [period], (err, res) => {
			resolve(res[0]);
		});
	});
}

// 2. 计算技术指标
async function calculateIndicators(data) {
	// 计算布林带
	const closes = data.map((d) => d.close);
	const [lower, middle, upper] = await new Promise((resolve) => {
		tulind.indicators.bbands.indicator([closes], [20, 2], (err, res) => {
			resolve(res);
		});
	});

	const [emaFast, emaSlow] = await Promise.all([
		calculateSingleEMA(5, closes),
		calculateSingleEMA(20, closes),
	]);

	// 合并指标到数据
	return data.map((d, i) =>
		Object.assign(d, {
			bb_middle: middle[i],
			bb_upper: upper[i],
			bb_lower: lower[i],
			emaFast: emaFast[i],
			emaSlow: emaSlow[i],
		})
	);
}

// 3. 策略逻辑
function generateSignals() {
	const data = dataWithIndicatorsMap['1m'];

	let position = null;
	const signals = [];

	for (let i = 1; i < data.length; i++) {
		const current = data[i];
		const prev = data[i - 1];

		const target_5 = marketData['5m'].find(
			(d) =>
				d.timestamp >= current.timestamp &&
				d.timestamp < current.timestamp + 5 * 60 * 1000
		);
		const target_15 = marketData['15m'].find(
			(d) =>
				d.timestamp >= current.timestamp &&
				d.timestamp < current.timestamp + 30 * 60 * 1000
		);

		// 买入信号
		if (
			!position &&
			current.emaFast > current.emaSlow &&
			target_5.emaFast > target_5.emaSlow &&
			target_15.emaFast > target_15.emaSlow
		) {
			position = {
				entryPrice: current.close,
				entryTime: current.timestamp,
				stopLoss: current.bb_lower,
				takeProfit: current.bb_upper,
			};
			signals.push(Object.assign({ type: 'buy', index: i }, position));
		}

		let isCloseCondition = false;
		if (position) {
			const hardStopPrice = position.entryPrice * (1 - config.stopLoss);
			const hardTakeProfitPrice =
				position.entryPrice * (1 + config.takeProfit);
			isCloseCondition =
				current.close < hardStopPrice ||
				current.close > hardTakeProfitPrice;
		}

		// 卖出信号
		if (
			position &&
			(current.emaFast < current.emaSlow || isCloseCondition) // 触及止损
		) {
			signals.push({
				type: 'sell',
				exitPrice: current.close,
				exitTime: current.timestamp,
				return:
					(current.close - position.entryPrice) / position.entryPrice,
				index: i,
			});
			position = null;
		}
	}

	return signals;
}

// 4. 回测引擎
function backtest(signals) {
	let balance = 1000; // 初始资金
	let maxBalance = balance;
	let maxDrawdown = 0;
	const trades = [];

	for (const signal of signals) {
		if (signal.type === 'buy') {
			const trade = {
				entry: signal.entryPrice,
				entryTime: signal.entryTime,
				exit: null,
				exitTime: null,
				quantity: balance / signal.entryPrice,
			};
			balance = 0;
			trades.push(trade);
		} else if (trades.length > 0) {
			const trade = trades[trades.length - 1];
			trade.exit = signal.exitPrice;
			trade.exitTime = signal.exitTime;
			balance = trade.quantity * signal.exitPrice;

			// 计算最大回撤
			maxBalance = Math.max(maxBalance, balance);
			const drawdown = (maxBalance - balance) / maxBalance;
			maxDrawdown = Math.max(maxDrawdown, drawdown);
		}
	}

	return { balance, maxDrawdown, trades };
}

// 5. 统计指标
function calculateMetrics(trades, maxDrawdown) {
	const profitable = trades.filter((t) => t.exit > t.entry).length;
	const loss = trades.filter((t) => t.exit <= t.entry).length;
	const winRate = profitable / (profitable + loss);

	const returns = trades.map((t) => (t.exit - t.entry) / t.entry);
	const avgWin =
		returns.filter((r) => r > 0).reduce((a, b) => a + b, 0) / profitable;
	const avgLoss =
		returns.filter((r) => r <= 0).reduce((a, b) => a + b, 0) / loss;

	return {
		totalTrades: trades.length,
		winRate: winRate.toFixed(2),
		profitFactor: (avgWin / Math.abs(avgLoss)).toFixed(2),
		maxDrawdown: (maxDrawdown * 100).toFixed(1) + '%',
	};
}

// 6. 执行主程序
async function main() {
	const { periods } = config.emaSettings;
	const tfs = Object.keys(periods);
	const numList = [100, 600, 3000];

	let i = 0;
	while (true) {
		try {
			const period = tfs[i];
			const rawData = await fetchOHLCV(period, numList[i]);
			marketData[period] = rawData;

			// 计算指标
			const dataWithIndicators = await calculateIndicators(rawData);
			dataWithIndicatorsMap[period] = dataWithIndicators;

			i += 1;
			if (i >= tfs.length) break;
		} catch (e) {
			console.log(e);
		}
	}
	// Object.entries(periods).forEach(async ([period, times]) => {
	// 	// 获取数据
	// 	const rawData = await fetchOHLCV(period, 500);
	// 	marketData[period] = rawData;

	// 	// 计算指标
	// 	const dataWithIndicators = await calculateIndicators(rawData);
	// 	dataWithIndicatorsMap[period] = dataWithIndicators;

	// 	console.log(marketData, dataWithIndicatorsMap);
	// });
	// // 获取数据
	// const rawData = await fetchOHLCV();
	// if (rawData.length === 0) return;

	// 计算指标
	// const dataWithIndicators = await calculateIndicators(rawData);

	// 生成信号
	const signals = generateSignals();

	// 执行回测
	const { balance, maxDrawdown, trades } = backtest(signals);

	// 输出结果
	console.log('===== 回测结果 =====');
	console.log('最终余额:', balance.toFixed(2));
	console.log('总交易次数:', trades.length);
	console.log(calculateMetrics(trades, maxDrawdown));
	console.log('最大回撤:', (maxDrawdown * 100).toFixed(1) + '%');
}

main();

app.listen(8092);

console.log('8092 server start');

process.on('uncaughtException', function (e) {
	//打印出错误
	restart(e);
});

let exec = require('child_process').exec;
function restart(e) {
	console.log('restarting......', e);
	setTimeout(() => {
		exec('npm run restart', function (err, stdout, stderr) {
			if (err) {
				console.log('restarting failed');
			} else {
				console.log('restarting success');
			}
		});
	}, 1000 * 2);
}
function start() {
	console.log('starting......');
	setTimeout(() => {
		exec('npm run start', function (err, stdout, stderr) {
			if (err) {
				console.log('starting failed');
			} else {
				console.log('starting success');
			}
		});
	}, 1000 * 2);
}
function stop() {
	console.log('stopping......');
	setTimeout(() => {
		exec('npm run stop', function (err, stdout, stderr) {
			if (err) {
				console.log('stopping failed');
			} else {
				console.log('stopping success');
			}
			setTimeout(() => {
				start();
			}, 1000 * 60 * 60 * 24 * 1);
		});
	}, 1000 * 2);
}
