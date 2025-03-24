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
// const _ = require('lodash');

// 策略配置
const config = {
	symbol: 'DOGE/USDT',
	timeframe: '15m',
	timeframes: ['1h', '15m', '5m' /* '1m'*/], // 多周期参数
	emaSettings: {
		'1h': { period: 30, slopeWindow: 5 },
		'15m': { period: 20, slopeWindow: 5 },
		'5m': { period: 5, slopeWindow: 5 },
	},
	slopeThreshold: {
		'1h': 0,
		'15m': 0.003 * 0.01,
		'5m': 0.005 * 0.01,
	}, // 斜率阈值
	macdParams: { '1h': [12, 26, 9], '15m': [12, 26, 9], '5m': [12, 26, 9] },
	slowframe: '1h',
	mediumframe: '15m',
	fastframe: '5m',
	kWindowTresholdFast: 3,
	kWindowTresholdMedium: 5,
	// 布林线参数
	bollinger: {
		period: 20,
		stdDev: 1.8,
	},
	// EMA斜率参数
	emaSlope: {
		period: 10,
		lookback: 5, // 计算5根K线斜率
		emaSlopeThreshold: 0.05 * 0.01, // EMA斜率阈值
	},
	atrParam: {
		// ATR参数
		atrPeriod: 14,
		stopLoss: 1.2,
		takeProfit: 1.8,
	},

	// 风险参数
	riskPerTrade: 0.02, // 每笔交易风险2%
	feeRate: 2 / 10000, // 交易手续费0.04%
	slippage: 0, // 滑点率
	initialBalance: 10000, // 初始本金10000 USDT

	coldStartBars: 1000,
};

class Backtester {
	constructor() {
		this.exchange = new ccxt.binance({
			apiKey: configBN.httpkey,
			secret: configBN.httpsecret,
			options: {
				adjustForTimeDifference: true,
				defaultType: 'future',
				hedgeMode: true,
			},
		});
		this.data = {
			[config.slowframe]: [],
			[config.mediumframe]: [],
			[config.fastframe]: [],
			merged: [],
		};
		this.trades = [];
		this.balance = config.initialBalance;
		this.totalFee = 0;
	}

	async loadHistoricalData(start, end) {
		try {
			const since = moment(start).valueOf();
			const until = moment(end).valueOf();

			// 多周期并行数据加载
			await Promise.all(
				config.timeframes.map(async (tf) => {
					let allCandles = [];
					let currentSince = since;

					while (currentSince < until) {
						const candles = await this.exchange.fetchOHLCV(
							config.symbol,
							tf,
							currentSince,
							config.coldStartBars
						);

						if (candles.length === 0) break;

						allCandles = allCandles.concat(candles);
						currentSince = candles[candles.length - 1][0] + 1;

						// 限速处理
						await new Promise((resolve) =>
							setTimeout(resolve, 200)
						);
					}

					this.data[tf] = allCandles.map((c) => this.parseCandle(c));
					console.log(`Loaded ${this.data[tf].length} ${tf} candles`);
				})
			);

			this.mergeTimeframes();
			return this.data;
		} catch (e) {
			console.error('Data loading failed:', e.message);
			process.exit(1);
		}
	}

	// 多周期时间戳对齐
	mergeTimeframes() {
		const baseTimestamps = this.data[config.fastframe].map(
			(c) => c.timestamp
		);

		config.timeframes.forEach((tf) => {
			if (tf === config.fastframe) return;
			this.data[tf] = this.data[tf].filter((c) =>
				baseTimestamps.includes(c.timestamp)
			);
		});
	}

	getTimeStampBefore(dataList, timestamp) {
		dataList = JSON.parse(JSON.stringify(dataList));
		let data;
		let i = 1;
		const period = config.fastframe.split('m')[0];

		while (true) {
			const time = moment(timestamp).subtract(
				Number(period) * i,
				'minutes'
			);
			const targetIndex = dataList.findIndex(
				(c) => c.timestamp === time.valueOf()
			);
			if (targetIndex > 0) {
				data = dataList[targetIndex - 1];
				break;
			}
			i += 1;
		}
		return data;
	}

	getTimeStampSlowBefore(dataList, timestamp) {
		dataList = JSON.parse(JSON.stringify(dataList));
		let data;

		const hour = moment(timestamp).format('YYYY-MM-DD HH:00:00');
		const lastHourTimestamp = moment(hour).subtract(1, 'hours');

		const target = dataList.find(
			(c) => c.timestamp === lastHourTimestamp.valueOf()
		);
		if (target) {
			data = target;
		}
		return data;
	}

	parseCandle(c) {
		return {
			timestamp: c[0],
			open: parseFloat(c[1]),
			high: parseFloat(c[2]),
			low: parseFloat(c[3]),
			close: parseFloat(c[4]),
			volume: parseFloat(c[5]),
		};
	}

	async calculateIndicators() {
		try {
			const indicatorPromises = [];

			config.timeframes.forEach(async (tf) => {
				// 计算布林带
				const closes = this.data[tf].map((d) => d.close);
				const highs = this.data[tf].map((d) => d.high);
				const lows = this.data[tf].map((d) => d.low);

				indicatorPromises.push(
					tulind.indicators.ema.indicator(
						[closes],
						[config.emaSettings[tf].period]
					)
				);

				indicatorPromises.push(
					tulind.indicators.bbands.indicator(
						[closes],
						[config.bollinger.period, config.bollinger.stdDev]
					)
				);

				indicatorPromises.push(
					tulind.indicators.atr.indicator(
						[highs, lows, closes],
						[config.atrParam.atrPeriod]
					)
				);

				indicatorPromises.push(
					tulind.indicators.macd.indicator(
						[closes],
						config.macdParams[tf]
					)
				);
			});

			const result = await Promise.all(indicatorPromises);

			// 合并指标到数据
			config.timeframes.forEach((tf, index) => {
				const [ema, bollinger, atr, macd] = result.slice(
					index * 4,
					(index + 1) * 4
				);
				// 计算EMA斜率
				const emaSlopes = [];
				for (
					let i = config.emaSettings[tf].slopeWindow;
					i < ema[0].length;
					i++
				) {
					const slope =
						(ema[0][i] -
							ema[0][i - config.emaSettings[tf].slopeWindow]) /
						config.emaSettings[tf].slopeWindow;
					emaSlopes.push(slope);
				}

				// 合并指标到数据
				this.data[tf].forEach((d, i) => {
					if (i >= config.bollinger.period) {
						const bbIndex = i - config.bollinger.period;
						d.lower = bollinger[0][bbIndex];
						d.middle = bollinger[1][bbIndex];
						d.upper = bollinger[2][bbIndex];
					}
					if (
						i >=
						// config.emaSettings[tf].period +
						config.emaSettings[tf].slopeWindow
					) {
						const slopeIndex =
							i -
							// config.emaSettings[tf].period -
							config.emaSettings[tf].slopeWindow;
						d.emaSlope = emaSlopes[slopeIndex];
					}
					if (i >= config.macdParams[tf][1]) {
						const macdIndex = i - config.macdParams[tf][1];
						d.macd = macd ? macd[0][macdIndex] : null;
						d.macdHistogram =
							macd[0][macdIndex] - macd[1][macdIndex] || null;
					}
					d.atr = atr[0][i];
					d.ema = ema[0][i];
				});
			});
		} catch (e) {
			console.error('指标计算错误:', e);
		}
	}

	getPositionSize(price, atr) {
		const riskAmount = this.balance * config.riskPerTrade;
		// return riskAmount / (atr * 2); // 2倍ATR止损
		// return 5000;
		return this.balance / 2;
	}

	getLongShort(dataList, index, WindowTreshold) {
		const longs = dataList
			.slice(index - WindowTreshold, index)
			.filter((item) => item.close > item.open);
		const shorts = dataList
			.slice(index - WindowTreshold, index)
			.filter((item) => item.close < item.open);
		return { longs, shorts };
	}

	runBacktest() {
		let position = null;
		// let atr = 0;

		this.data[config.fastframe].forEach(async (d, index) => {
			// 跳过前50根K线确保指标稳定
			if (index < 50) return;
			// // 计算ATR
			// if (i >= config.atrParam.atrPeriod) {
			// 	const high = this.data
			// 		.slice(i - config.atrParam.atrPeriod, i)
			// 		.map((x) => x.high);
			// 	const low = this.data
			// 		.slice(i - config.atrParam.atrPeriod, i)
			// 		.map((x) => x.low);
			// 	const closes = this.data
			// 		.slice(i - config.atrParam.atrPeriod, i)
			// 		.map((x) => x.close);
			// 	atr = d.atr;
			// }

			// const lastKline5M = JSON.parse(
			// 	JSON.stringify(this.data[config.fastframe][index])
			// );

			// const candle = {
			// 	[config.slowframe]: this.getTimeStampSlowBefore(
			// 		this.data[config.slowframe],
			// 		lastKline5M.timestamp
			// 	),
			// 	[config.mediumframe]: this.getTimeStampBefore(
			// 		this.data[config.mediumframe],
			// 		lastKline5M.timestamp
			// 	),
			// 	[config.fastframe]: lastKline5M,
			// };

			const { longs, shorts } = this.getLongShort(
				this.data[config.fastframe],
				index,
				config.kWindowTresholdFast
			);

			const mediumKline = this.getTimeStampBefore(
				this.data[config.mediumframe],
				d.timestamp
			);
			const mediumIndex = this.data[config.mediumframe].findIndex(
				(item) => item.timestamp === mediumKline.timestamp
			);
			const { longs: mediumLongs, shorts: mediumShorts } =
				this.getLongShort(
					this.data[config.mediumframe],
					mediumIndex,
					config.kWindowTresholdMedium
				);

			// 生成信号
			const signal = this.generateSignal(
				longs,
				shorts,
				mediumLongs,
				mediumShorts
			);

			// 处理平仓
			if (position) {
				// const isProfitTarget =
				// 	position.direction === 'long'
				// 		? d.close >= position.entryPrice * (1 + 0.005)
				// 		: d.close <= position.entryPrice * (1 - 0.005);

				// const isStopLoss =
				// 	position.direction === 'long'
				// 		? d.close <= position.entryPrice * (1 - 0.0025)
				// 		: d.close >= position.entryPrice * (1 + 0.0025);

				const isProfitTarget =
					position.direction === 'long'
						? d.close >= position.entryPrice + position.takeProfit
						: d.close <= position.entryPrice - position.takeProfit;

				const isStopLoss =
					position.direction === 'long'
						? d.close <= position.entryPrice - position.stopLoss
						: d.close >= position.entryPrice + position.stopLoss;

				// const isReverse =
				// 	position.direction === 'long'
				// 		? d.emaSlope < -config.emaSlope.emaSlopeThreshold
				// 		: d.emaSlope > config.emaSlope.emaSlopeThreshold;

				const isReverse =
					signal && position.direction === 'long'
						? signal.direction === 'short'
						: signal.direction === 'long';

				// const isReverse =
				// 	signal && position.direction === 'long'
				// 		? longs.length < shorts.length
				// 		: longs.length > shorts.length;

				// const isReverse = isProfitTarget || isStopLoss;

				// const isReverse =
				// 	position &&
				// 	(position.direction === 'long'
				// 		? candle[config.mediumframe].close <
				// 		  candle[config.mediumframe].ema
				// 		: candle[config.mediumframe].close >
				// 		  candle[config.mediumframe].ema);

				if (isReverse) {
					// console.log(
					//   config.fastframe,
					//   Object.assign(candle[config.fastframe], {
					//     timestamp: moment(candle[config.fastframe].timestamp).format(
					//       "YYYY-MM-DD HH:mm:ss"
					//     ),
					//   })
					// );
					// console.log(
					//   config.mediumframe,
					//   Object.assign(candle[config.mediumframe], {
					//     timestamp: moment(candle[config.mediumframe].timestamp).format(
					//       "YYYY-MM-DD HH:mm:ss"
					//     ),
					//   })
					// );
					// console.log(
					//   config.slowframe,
					//   Object.assign(candle[config.slowframe], {
					//     timestamp: moment(candle[config.slowframe].timestamp).format(
					//       "YYYY-MM-DD HH:mm:ss"
					//     ),
					//   })
					// );

					this.closePosition(position, d);
					position = null;
				}
			}

			// 处理开仓
			if (!position && signal) {
				// console.log(
				//   config.fastframe,
				//   Object.assign(candle[config.fastframe], {
				//     timestamp: moment(candle[config.fastframe].timestamp).format(
				//       "YYYY-MM-DD HH:mm:ss"
				//     ),
				//   })
				// );
				// console.log(
				//   config.mediumframe,
				//   Object.assign(candle[config.mediumframe], {
				//     timestamp: moment(candle[config.mediumframe].timestamp).format(
				//       "YYYY-MM-DD HH:mm:ss"
				//     ),
				//   })
				// );
				// console.log(
				//   config.slowframe,
				//   Object.assign(candle[config.slowframe], {
				//     timestamp: moment(candle[config.slowframe].timestamp).format(
				//       "YYYY-MM-DD HH:mm:ss"
				//     ),
				//   })
				// );
				position = this.openPosition(d, d.atr, signal.direction);
			}
		});
	}

	async calculateATR(highs, lows, closes) {
		return new Promise((resolve) => {
			tulind.indicators.atr.indicator(
				[highs, lows, closes],
				[config.atrParam.atrPeriod],
				(err, res) => {
					resolve(res[0]);
				}
			);
		});
	}

	generateSignal(longs, shorts, mediumLongs, mediumShorts) {
		// // 多头信号
		// if (
		// 	candle.close <= candle.middle &&
		// 	candle.emaSlope > config.emaSlope.emaSlopeThreshold
		// ) {
		// 	return { direction: 'long' };
		// }

		// // 空头信号
		// if (
		// 	candle.close >= candle.middle &&
		// 	candle.emaSlope < -config.emaSlope.emaSlopeThreshold
		// ) {
		// 	return { direction: 'short' };
		// }

		const longCondition =
			longs.length < shorts.length && mediumLongs > mediumShorts;

		const shortCondition =
			shorts.length < longs.length && mediumShorts > mediumLongs;

		// 多头信号
		if (longCondition) {
			return { direction: 'long' };
		}

		// 空头信号
		if (shortCondition) {
			return { direction: 'short' };
		}

		return null;
	}

	openPosition(candle, atr, direction) {
		const positionSize = this.getPositionSize(candle.close, atr);
		const fee =
			positionSize * candle.close * (config.feeRate + config.slippage);

		const position = {
			entryPrice: candle.close,
			entryTime: candle.timestamp,
			direction: direction,
			size: positionSize,
			takeProfit: atr * config.atrParam.takeProfit,
			stopLoss: atr * config.atrParam.stopLoss,
		};

		this.balance -= fee; // 扣除手续费
		this.totalFee += fee;
		// console.log(moment(candle.timestamp).format('YYYY-MM-DD HH:mm:ss'));
		// console.log(candle.close, candle.middle, candle.emaSlope);
		// console.log('direction', position.direction);
		// console.log('middle', candle.middle);
		// console.log('high', candle.high);
		// console.log('low', candle.low);
		return position;
	}

	closePosition(position, exitCandle) {
		const fee =
			position.size *
			exitCandle.close *
			(config.feeRate + config.slippage);
		const profit =
			position.direction === 'long'
				? (exitCandle.close - position.entryPrice) * position.size
				: (position.entryPrice - exitCandle.close) * position.size;

		this.balance += profit - fee;
		this.totalFee += fee;
		this.trades.push({
			size: position.size,
			direction: position.direction,
			entry: position.entryPrice,
			exit: exitCandle.close,
			profit: profit,
			fee,
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
      手续费:       ${this.totalFee}
      =============================
    `);
		console.log('\n最近20笔交易:');
		console.table(this.trades.slice(-20));
	}
}

// 执行回测
(async () => {
	const backtester = new Backtester();
	const start = '2025-01-01';
	const end = '2025-03-24';
	const interval = 5;
	let profitTotal = 0;

	let i = 0;
	while (moment(end).isAfter(moment(start).add(i + interval, 'days'))) {
		// while (i === 0) {
		try {
			backtester.data = {
				[config.slowframe]: [],
				[config.mediumframe]: [],
				[config.fastframe]: [],
				merged: [],
			};
			backtester.trades = [];
			backtester.balance = config.initialBalance;
			backtester.totalFee = 0;

			// 步骤1: 加载历史数据
			const data = await backtester.loadHistoricalData(
				moment(start).add(i, 'days').format('YYYY-MM-DD'),
				moment(start)
					.add(i + interval, 'days')
					.format('YYYY-MM-DD')
			);

			// 步骤2: 计算指标
			await backtester.calculateIndicators();

			// console.log(
			// 	data['5m'].slice(-3).map((candle) =>
			// 		Object.assign(candle, {
			// 			timestamp: moment(candle.timestamp).format(
			// 				'YYYY-MM-DD HH:mm:ss'
			// 			),
			// 		})
			// 	)
			// );

			// 步骤3: 运行回测
			backtester.runBacktest();

			// 步骤4: 显示结果
			backtester.showResults();

			profitTotal += backtester.balance - config.initialBalance;

			i += interval;
		} catch (e) {
			console.log(e);
		}
	}
	console.log('profitTotal', profitTotal);
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
