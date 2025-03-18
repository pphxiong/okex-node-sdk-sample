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

// 策略配置
const config = {
	symbol: 'DOGE/USDT',
	timeframe: '15m',
	// 布林线参数
	bollinger: {
		period: 20,
		stdDev: 1.8,
	},
	// EMA斜率参数
	emaSlope: {
		period: 10,
		lookback: 5, // 计算5根K线斜率
	},
	// 风险参数
	riskPerTrade: 0.02, // 每笔交易风险2%
	feeRate: 0.0004, // 交易手续费0.04%
	initialBalance: 10000, // 初始本金10000 USDT
};

class Backtester {
	constructor() {
		this.exchange = new ccxt.binance();
		this.data = [];
		this.trades = [];
		this.balance = config.initialBalance;
	}

	async loadHistoricalData(start, end) {
		try {
			let allCandles = [];
			let since = new Date(start).getTime();
			const endTime = new Date(end).getTime();

			while (since < endTime) {
				const candles = await this.exchange.fetchOHLCV(
					config.symbol,
					config.timeframe,
					since,
					1000
				);
				allCandles = allCandles.concat(candles);
				since = candles[candles.length - 1][0] + 1;

				// 防止请求过频
				await new Promise((resolve) => setTimeout(resolve, 200));
			}

			this.data = allCandles.map((c) => ({
				timestamp: c[0],
				open: parseFloat(c[1]),
				high: parseFloat(c[2]),
				low: parseFloat(c[3]),
				close: parseFloat(c[4]),
				volume: parseFloat(c[5]),
			}));

			console.log(`Loaded ${this.data.length} candles`);
		} catch (e) {
			console.error('数据加载失败:', e.message);
		}
	}

	async calculateIndicators() {
		try {
			// 计算布林带
			const closes = this.data.map((d) => d.close);
			const highs = this.data.map((d) => d.high);
			const lows = this.data.map((d) => d.low);
			const bollinger = await tulind.indicators.bbands.indicator(
				[closes],
				[config.bollinger.period, config.bollinger.stdDev]
			);

			// 计算EMA
			const ema = await tulind.indicators.ema.indicator(
				[closes],
				[config.emaSlope.period]
			);

			const atr = await this.calculateATR(highs, lows, closes);

			// 计算EMA斜率
			const emaSlopes = [];
			for (let i = config.emaSlope.lookback; i < ema[0].length; i++) {
				const slope =
					(ema[0][i] - ema[0][i - config.emaSlope.lookback]) /
					config.emaSlope.lookback;
				emaSlopes.push(slope);
			}

			// 合并指标到数据
			this.data.forEach((d, i) => {
				if (i >= config.bollinger.period) {
					const bbIndex = i - config.bollinger.period;
					d.upper = bollinger[0][bbIndex];
					d.middle = bollinger[1][bbIndex];
					d.lower = bollinger[2][bbIndex];
				}
				if (i >= config.emaSlope.period + config.emaSlope.lookback) {
					const slopeIndex =
						i - config.emaSlope.period - config.emaSlope.lookback;
					d.emaSlope = emaSlopes[slopeIndex];
				}
				d.atr = atr[i];
			});
			// this.data.slice(-100).forEach((d) => {
			// 	console.log(moment(d.timestamp).format('YYYY-MM-DD HH:mm:ss'));
			// 	console.log(d.emaSlope);
			// 	console.log(d.atr);
			// 	console.log(d.upper);
			// 	console.log(d.middle);
			// 	console.log(d.lower);
			// });
		} catch (e) {
			console.error('指标计算错误:', e);
		}
	}

	getPositionSize(price, atr) {
		const riskAmount = this.balance * config.riskPerTrade;
		// return riskAmount / (atr * 2); // 2倍ATR止损
		return 5000;
	}

	async fetchHistoricalData(start, end) {
		let allCandles = [];
		let since = new Date(start).getTime();
		const endTime = new Date(end).getTime();

		while (since < endTime) {
			const candles = await this.exchange.fetchOHLCV(
				'DOGE/USDT',
				'5m',
				since,
				1000
			);
			allCandles = allCandles.concat(candles);
			since = candles[candles.length - 1][0] + 1;

			// 防止请求过频
			await new Promise((resolve) => setTimeout(resolve, 200));
		}

		return allCandles.map((c) => ({
			timestamp: c[0],
			open: parseFloat(c[1]),
			high: parseFloat(c[2]),
			low: parseFloat(c[3]),
			close: parseFloat(c[4]),
			volume: parseFloat(c[5]),
		}));
	}

	runBacktest() {
		let position = null;
		let atr = 0;

		this.data.forEach(async (d, i) => {
			// 跳过前50根K线确保指标稳定
			// if (i < 50) return;
			// 计算ATR
			if (i >= 14) {
				const high = this.data.slice(i - 14, i).map((x) => x.high);
				const low = this.data.slice(i - 14, i).map((x) => x.low);
				const closes = this.data.slice(i - 14, i).map((x) => x.close);
				// atr = await tulind.indicators.atr.indicator(
				// 	[high, low, closes],
				// 	[14]
				// )[0][0];
				atr = d.atr;
			}

			// 生成信号
			const signal = this.generateSignal(d);

			// 处理平仓
			if (position) {
				const isProfitTarget =
					signal.direction === 'long'
						? d.close >= position.entryPrice + position.takeProfit
						: d.close <= position.entryPrice - position.takeProfit;

				const isStopLoss =
					signal.direction === 'long'
						? d.close <= position.entryPrice - position.stopLoss
						: d.close >= position.entryPrice + position.stopLoss;

				const isReverse =
					position.direction === 'long'
						? d.emaSlope < 0
						: d.emaSlope > 0;

				if (/* isProfitTarget || isStopLoss || */ isReverse) {
					this.closePosition(position, d);
					position = null;
				}
			}

			// 处理开仓
			if (!position && signal) {
				position = this.openPosition(d, atr, signal.direction);
			}
		});
	}

	async calculateATR(highs, lows, closes) {
		return new Promise((resolve) => {
			tulind.indicators.atr.indicator(
				[highs, lows, closes],
				[14],
				(err, res) => {
					resolve(res[0]);
				}
			);
		});
	}

	generateSignal(candle) {
		if (!candle.upper || !candle.emaSlope) return null;

		// 多头信号
		if (candle.close <= candle.middle && candle.emaSlope > 0.05 * 0.01) {
			return { direction: 'long' };
		}

		// 空头信号
		if (candle.close >= candle.middle && candle.emaSlope < -0.05 * 0.01) {
			return { direction: 'short' };
		}

		return null;
	}

	openPosition(candle, atr, direction) {
		const positionSize = this.getPositionSize(candle.close, atr);
		const fee = positionSize * candle.close * config.feeRate;

		const position = {
			entryPrice: candle.close,
			entryTime: candle.timestamp,
			direction: direction,
			size: positionSize,
			takeProfit: atr * 1.8,
			stopLoss: atr * 1.2,
		};

		this.balance -= fee; // 扣除手续费
		return position;
	}

	closePosition(position, exitCandle) {
		const fee = position.size * exitCandle.close * config.feeRate;
		const profit =
			position.direction === 'long'
				? (exitCandle.close - position.entryPrice) * position.size
				: (position.entryPrice - exitCandle.close) * position.size;

		this.balance += profit - fee;
		this.trades.push({
			size: position.size,
			direction: position.direction,
			entry: position.entryPrice,
			exit: exitCandle.close,
			profit: profit,
			duration: exitCandle.timestamp - position.entryTime,
			entryTime: moment(position.entryTime).format('YYYY-MM-DD HH:mm:ss'),
			exitTime: moment(exitCandle.timestamp).format(
				'YYYY-MM-DD HH:mm:ss'
			),
		});
	}

	showResults() {
		const wins = this.trades.filter((t) => t.profit > 0);
		const losses = this.trades.filter((t) => t.profit <= 0);

		const totalProfit = this.trades.reduce((sum, t) => sum + t.profit, 0);
		const winRate = ((wins.length / this.trades.length) * 100).toFixed(2);
		const profitFactor =
			wins.reduce((s, t) => s + t.profit, 0) /
			Math.abs(losses.reduce((s, t) => s + t.profit, 0));

		console.log(`
      ========== 回测结果 ==========
      总交易次数:     ${this.trades.length}
      胜率:          ${winRate}%
      总收益:        ${totalProfit.toFixed(2)} USDT
      期末余额:      ${this.balance.toFixed(2)} USDT
      盈亏比:        ${profitFactor.toFixed(2)}
      最大单笔盈利:  ${Math.max(...this.trades.map((t) => t.profit)).toFixed(2)}
      最大单笔亏损:  ${Math.min(...this.trades.map((t) => t.profit)).toFixed(2)}
      =============================
    `);
		console.log('\n最近5笔交易:');
		console.table(this.trades.slice(-20));
	}
}

// 执行回测
(async () => {
	const backtester = new Backtester();

	// 步骤1: 加载历史数据
	await backtester.loadHistoricalData('2025-01-18', '2025-03-17');

	// 步骤2: 计算指标
	await backtester.calculateIndicators();

	// 步骤3: 运行回测
	backtester.runBacktest();

	// 步骤4: 显示结果
	backtester.showResults();
})();

app.listen(8092);

console.log('8092 server start');

process.on('uncaughtException', function (e) {
	//打印出错误
	//   restart(e);
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
