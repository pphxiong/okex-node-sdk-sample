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

const ccxt = require('ccxt');
const tulind = require('tulind');
// const { plot } = require('nodeplotlib');

// 策略参数配置
const config = {
	symbol: 'DOGE/USDT', // 交易对
	timeframe: '5m', // K线周期
	capital: 1000, // 初始本金(USDT)
	fee: 0.0005, // 交易手续费率(0.05%)
	emaShortPeriod: 9, // 短期EMA周期
	emaLongPeriod: 21, // 长期EMA周期
	startTime: '2024-10-01T00:00:00Z', // 回测起始时间
	endTime: '2024-12-01T00:00:00Z', // 回测结束时间
};

// 计算技术指标（Promise封装）
async function calculateIndicator(data, indicatorConfig) {
	return new Promise((resolve, reject) => {
		tulind.indicators[indicatorConfig.name].indicator(
			[data],
			indicatorConfig.params,
			(err, results) => (err ? reject(err) : resolve(results))
		);
	});
}

// 获取历史数据
async function fetchHistoricalData() {
	const exchange = new ccxt.binance({ enableRateLimit: true });
	let since = new Date(config.startTime).getTime();
	const allOHLCV = [];

	// while (true) {
	// 	const ohlcv = await exchange.fetchOHLCV(
	// 		config.symbol,
	// 		config.timeframe,
	// 		since,
	// 		1000
	// 	);
	// 	console.log(11, ohlcv);
	// 	if (ohlcv.length === 0) break;
	// 	allOHLCV.push(...ohlcv);
	// 	since = ohlcv[ohlcv.length - 1][0] + 1;
	// 	if (since > new Date(config.endTime).getTime()) break;
	// }

	const ohlcv = await exchange.fetchOHLCV(
		config.symbol,
		config.timeframe,
		since,
		1000
	);
	console.log(11, ohlcv);
	allOHLCV.push(...ohlcv);

	return allOHLCV.reverse(); // 确保旧数据在前
}

// 生成交易信号
function generateSignals(ohlcv, emaShort, emaLong) {
	const signals = [];
	let position = null; // 当前持仓状态

	for (let i = 1; i < ohlcv.length; i++) {
		const currentTime = new Date(ohlcv[i][0]);
		const price = ohlcv[i][4];

		// EMA交叉检测
		const prevShort = emaShort[i - 1];
		const prevLong = emaLong[i - 1];
		const currShort = emaShort[i];
		const currLong = emaLong[i];

		// 金叉信号（买入）
		if (prevShort < prevLong && currShort > currLong) {
			if (!position) {
				signals.push({ time: currentTime, type: 'buy', price });
				position = { entryPrice: price, entryTime: currentTime };
			}
		}

		// 死叉信号（卖出）
		if (prevShort > prevLong && currShort < currLong) {
			if (position) {
				signals.push({
					time: currentTime,
					type: 'sell',
					price,
					holdPeriod:
						(currentTime - position.entryTime) / (1000 * 60), // 持仓分钟数
					pnl:
						(price / position.entryPrice - 1) * 100 -
						config.fee * 2, // 计算盈亏
				});
				position = null;
			}
		}
	}

	return signals;
}

// 执行回测
function runBacktest(signals) {
	let capital = config.capital;
	const history = [];
	let winCount = 0;

	signals.forEach((trade, idx) => {
		if (trade.type === 'buy') {
			// 记录买入
			history.push({
				type: 'buy',
				time: trade.time,
				price: trade.price,
				capitalBefore: capital,
			});
		} else {
			// 计算卖出盈亏
			const roi = trade.pnl;
			const profit = capital * (roi / 100);
			capital += profit;

			if (roi > 0) winCount++;

			history.push({
				type: 'sell',
				time: trade.time,
				price: trade.price,
				roi: roi.toFixed(2) + '%',
				profit: profit.toFixed(2),
				capitalAfter: capital,
				holdMinutes: trade.holdPeriod,
			});
		}
	});

	return {
		finalCapital: capital,
		totalReturn: ((capital / config.capital - 1) * 100).toFixed(2) + '%',
		winRate: ((winCount / (signals.length / 2)) * 100).toFixed(2) + '%', // 每笔卖出对应一笔买入
		maxDrawdown: calculateMaxDrawdown(history),
		trades: history,
	};
}

// 计算最大回撤
function calculateMaxDrawdown(tradeHistory) {
	let peak = config.capital;
	let maxDrawdown = 0;

	tradeHistory.forEach((trade) => {
		if (trade.capitalAfter) {
			if (trade.capitalAfter > peak) peak = trade.capitalAfter;
			const drawdown = ((peak - trade.capitalAfter) / peak) * 100;
			if (drawdown > maxDrawdown) maxDrawdown = drawdown;
		}
	});

	return maxDrawdown.toFixed(2) + '%';
}

// 可视化资金曲线
function plotEquityCurve(history) {
	const data = [
		{
			x: [],
			y: [],
			type: 'scatter',
			name: '资金曲线',
		},
	];

	history
		.filter((t) => t.capitalAfter)
		.forEach((t) => {
			data[0].x.push(t.time);
			data[0].y.push(t.capitalAfter);
		});

	// plot(data);
}

// 主程序
async function main() {
	try {
		// 1. 获取历史数据
		const ohlcv = await fetchHistoricalData();
		console.log(`获取到 ${ohlcv.length} 条K线数据`);

		// 2. 计算EMA指标
		const closes = ohlcv.map((c) => c[4]);
		const [emaShort] = await calculateIndicator(closes, {
			name: 'ema',
			params: [config.emaShortPeriod],
		});
		const [emaLong] = await calculateIndicator(closes, {
			name: 'ema',
			params: [config.emaLongPeriod],
		});

		// 3. 对齐数据（EMA计算会减少数据长度）
		const alignedData = ohlcv.slice(-emaShort.length);

		// 4. 生成交易信号
		const signals = generateSignals(alignedData, emaShort, emaLong);
		console.log(`生成 ${signals.length} 个交易信号`);

		// 5. 执行回测
		const result = runBacktest(signals);

		// 6. 输出结果
		console.log(`
      最终资金: ${result.finalCapital.toFixed(2)} USDT
      总收益率: ${result.totalReturn}
      胜   率: ${result.winRate}
      最大回撤: ${result.maxDrawdown}
      交易次数: ${signals.length / 2} 次
    `);

		// 7. 绘制资金曲线
		plotEquityCurve(result.trades);
	} catch (err) {
		console.error('回测失败:', err);
	}
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
