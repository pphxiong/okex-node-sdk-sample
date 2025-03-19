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
	timeframes: ['1h', '15m', '5m'], // 多周期参数
	emaSettings: {
		'1h': { period: 50, slopeWindow: 5 },
		'15m': { period: 20, slopeWindow: 3 },
		'5m': { period: 10, slopeWindow: 2 },
	},
	riskParams: {
		riskPerTrade: 0.02, // 每笔交易风险2%
		maxLeverage: 3,
		stopLoss: 1.5, // ATR倍数
		takeProfit: 2.2,
	},
	initialBalance: 10000, // 初始本金
};

class MultiEMAStrategy {
	constructor() {
		this.exchange = new ccxt.binanceusdm();
		this.data = {
			'1h': [],
			'15m': [],
			'5m': [],
		};
		this.trades = [];
		this.balance = config.initialBalance;
		this.currentPosition = null;
	}

	async loadData(days = 30) {
		try {
			const since = moment().subtract(days, 'days').valueOf();

			// 多周期数据并行获取
			await Promise.all(
				config.timeframes.map(async (tf) => {
					const candles = await this.exchange.fetchOHLCV(
						config.symbol,
						tf,
						since,
						1000
					);
					this.data[tf] = candles.map((c) => ({
						time: c[0],
						open: c[1],
						high: c[2],
						low: c[3],
						close: c[4],
						volume: c[5],
					}));
					console.log(`Loaded ${this.data[tf].length} ${tf} candles`);
				})
			);

			// 时间轴对齐
			this.alignTimestamps();
		} catch (e) {
			console.error('数据加载失败:', e.message);
		}
	}

	alignTimestamps() {
		// 以5分钟数据为基准对齐时间戳
		const baseTimestamps = this.data['5m'].map((d) => d.time);

		config.timeframes.forEach((tf) => {
			if (tf === '5m') return;
			this.data[tf] = this.data[tf].filter((d) =>
				baseTimestamps.includes(d.time)
			);
		});
	}

	getTimeStampBefore(dataList, timestamp) {
		let data;
		let i = 0;
		while (true) {
			const time = moment(timestamp).subtract(5 * i, 'minutes');
			const target = dataList.find((c) => c.time === time.valueOf());
			if (target) {
				data = target;
				break;
			}
			i += 1;
		}
		return data;
	}

	async calculateEMASlopes() {
		try {
			// 多周期EMA斜率计算
			for (const tf of config.timeframes) {
				const closes = this.data[tf].map((d) => d.close);
				const period = config.emaSettings[tf].period;
				const slopeWindow = config.emaSettings[tf].slopeWindow;

				// 计算EMA
				const emaResults = await tulind.indicators.ema.indicator(
					[closes],
					[period]
				);
				const emaValues = emaResults[0];

				// 计算斜率
				const slopes = [];
				for (let i = slopeWindow; i < emaValues.length; i++) {
					const slope =
						(emaValues[i] - emaValues[i - slopeWindow]) /
						slopeWindow;
					slopes.push(slope);
				}

				// 合并数据
				this.data[tf].forEach((d, i) => {
					if (i >= period + slopeWindow) {
						d.ema = emaValues[i - period];
						d.slope = slopes[i - period - slopeWindow];
					}
				});
			}
		} catch (e) {
			console.error('指标计算失败:', e);
		}
	}

	generateSignal(index) {
		const current = {
			'1h': this.getTimeStampBefore(
				this.data['1h'],
				this.data['5m'][index].time
			),
			'15m': this.getTimeStampBefore(
				this.data['15m'],
				this.data['5m'][index].time
			),
			'5m': this.data['5m'][index],
		};

		console.log(current);

		// 多周期条件验证
		const bullCondition =
			current['1h'].slope &&
			current['1h'].slope > 0.0003 &&
			current['15m'].slope > 0.0005 &&
			current['5m'].slope > 0.0008;
		// current['15m'].volume > this.sma(current['15m'].volume, 5) * 1.2;

		const bearCondition =
			current['1h'].slope &&
			current['1h'].slope < -0.0003 &&
			current['15m'].slope < -0.0005 &&
			current['5m'].slope < -0.0008;
		// current['15m'].volume > this.sma(current['15m'].volume, 5) * 1.2;

		if (bullCondition) return 'long';
		if (bearCondition) return 'short';
		return null;
	}

	sma(values, period) {
		const sum = values.slice(-period).reduce((a, b) => a + b, 0);
		return sum / period;
	}

	async calculateATR(timeframe = '5m') {
		const highs = this.data[timeframe].map((d) => d.high);
		const lows = this.data[timeframe].map((d) => d.low);
		const closes = this.data[timeframe].map((d) => d.close);
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

	async runBacktest() {
		const atrValues = await this.calculateATR('5m');
		this.data['5m'].forEach((d, i) => {
			if (i < 100) return; // 跳过初始数据不足阶段

			const signal = this.generateSignal(i);
			const atr = atrValues[i];

			if (this.currentPosition) {
				this.checkExit(d, atr, i, signal);
			} else if (signal) {
				this.openPosition(d, atr, signal, i);
			}
		});
	}

	openPosition(candle, atr, direction, index) {
		const positionSize = this.calculatePositionSize(atr);
		const fee = positionSize * candle.close * 0.0004; // 手续费

		this.currentPosition = {
			entryPrice: candle.close,
			entryTime: candle.time,
			direction: direction,
			size: positionSize,
			stopLoss:
				direction === 'long'
					? candle.close - atr * config.riskParams.stopLoss
					: candle.close + atr * config.riskParams.stopLoss,
			takeProfit:
				direction === 'long'
					? candle.close + atr * config.riskParams.takeProfit
					: candle.close - atr * config.riskParams.takeProfit,
			atr: atr,
		};

		this.balance -= fee;
	}

	calculatePositionSize(atr) {
		const riskAmount = this.balance * config.riskParams.riskPerTrade;
		return riskAmount / (atr * config.riskParams.stopLoss);
	}

	checkExit(candle, atr, index, signal) {
		const pos = this.currentPosition;
		let closeReason = null;

		// 止损检查
		if (
			(pos.direction === 'long' && candle.low <= pos.stopLoss) ||
			(pos.direction === 'short' && candle.high >= pos.stopLoss)
		) {
			closeReason = 'stopLoss';
		}

		// 止盈检查
		if (
			(pos.direction === 'long' && candle.high >= pos.takeProfit) ||
			(pos.direction === 'short' && candle.low <= pos.takeProfit)
		) {
			closeReason = 'takeProfit';
		}

		if (pos.direction === 'long' && signal === 'short')
			closeReason = 'switch';

		if (pos.direction === 'short' && signal === 'long')
			closeReason = 'switch';

		// 时间止损（持仓超过24根15分钟K线）
		const duration =
			index - this.data['15m'].findIndex((d) => d.time === pos.entryTime);
		if (duration >= 24) closeReason = 'timeout';

		if (closeReason) {
			this.closePosition(candle, closeReason);
		} else {
			// 动态更新止损
			this.updateTrailingStop(candle, atr);
		}
	}

	updateTrailingStop(candle, atr) {
		const pos = this.currentPosition;
		const moveThreshold = atr * 0.5;

		if (pos.direction === 'long') {
			const newStop = candle.close - moveThreshold;
			pos.stopLoss = Math.max(pos.stopLoss, newStop);
		} else {
			const newStop = candle.close + moveThreshold;
			pos.stopLoss = Math.min(pos.stopLoss, newStop);
		}
	}

	closePosition(candle, reason) {
		const fee = this.currentPosition.size * candle.close * 0.0004;
		const profit =
			this.currentPosition.direction === 'long'
				? (candle.close - this.currentPosition.entryPrice) *
				  this.currentPosition.size
				: (this.currentPosition.entryPrice - candle.close) *
				  this.currentPosition.size;

		this.balance += profit - fee;

		this.trades.push({
			entry: this.currentPosition.entryPrice,
			exit: candle.close,
			profit: profit,
			duration:
				(candle.time - this.currentPosition.entryTime) / (60 * 1000),
			reason: reason,
		});

		this.currentPosition = null;
	}

	showResults() {
		const profitableTrades = this.trades.filter((t) => t.profit > 0);
		const winRate = (
			(profitableTrades.length / this.trades.length) *
			100
		).toFixed(1);

		console.log(`
      ========== 回测结果 ==========
      时间范围:     ${moment(this.data['15m'][0].time).format('YYYY-MM-DD')} 至 
                   ${moment(this.data['15m'].slice(-1)[0].time).format(
						'YYYY-MM-DD'
					)}
      总交易次数:   ${this.trades.length}
      胜率:        ${winRate}%
      总收益:      ${this.balance - config.initialBalance} USDT
      期末余额:    ${this.balance.toFixed(2)} USDT
      最大回撤:    ${this.calculateMaxDrawdown().toFixed(2)}%
      =============================
    `);
	}

	calculateMaxDrawdown() {
		let peak = config.initialBalance;
		let maxDrawdown = 0;

		this.trades.reduce((balance, trade) => {
			const current = balance + trade.profit;
			if (current > peak) peak = current;
			const dd = ((peak - current) / peak) * 100;
			if (dd > maxDrawdown) maxDrawdown = dd;
			return current;
		}, config.initialBalance);

		return maxDrawdown;
	}
}

// 执行回测
(async () => {
	const strategy = new MultiEMAStrategy();

	await strategy.loadData(120); // 加载60天数据
	await strategy.calculateEMASlopes();
	await strategy.runBacktest();
	strategy.showResults();
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
