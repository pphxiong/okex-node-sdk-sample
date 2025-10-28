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
const math = require('mathjs');
// const jstat = require('jstat');
const _ = require('lodash');

// 策略配置
const config = {
	symbol: 'DOGE/USDT',
	timeframe: '5m',
	timeframes: ['5m'], // 多周期参数
	emaSettings: {
		// '30m': { periods: [10, 5], slopeWindow: 5 },
		// '15m': { periods: [12, 26, 50], slopeWindow: 5 },
		// '1m': { periods: [21, 55, 200], slopeWindow: 5 },
		// '15m': { periods: [8, 21, 55], slopeWindow: 3 },
		'5m': { periods: [3, 5, 8, 13, 21, 34], slopeWindow: 3 },
		// '15m': { periods: [8, 34, 144], slopeWindow: 5 },
		// "15m": { periods: [25, 5], slopeWindow: 5 },
		// '5m': { periods: [10, 5], slopeWindow: 5 },
	},
	macdParams: { '5m': [12, 26, 9] /* '5m': [12, 26, 9] */ },
	slowframe: '5m',
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
		emaSlopeThreshold: 0.005 * 0.01, // EMA斜率阈值
		// emaSlopeThreshold: 0, // EMA斜率阈值
	},
	atrParam: {
		// ATR参数
		atrPeriod: 14,
		stopLoss: 2.5,
		takeProfit: 2,
	},
	feeRate: 2 / 10000, // 交易手续费0.04%
	slippage: 0, // 滑点率
	initialBalance: 1000, // 初始本金10000 USDT
	leverage: 10,
	riskPerTrade: 0.5, // 每笔交易风险2%
	// coldStartBars: 480,
	// coldStartBars: {
	//   "1h": 24,
	//   "30m": 48,
	//   "15m": 160,
	//   "5m": 480,
	//   "1m": 480 * 5,
	// },
	coldStartBars: {
		'1h': 500,
		'30m': 500,
		'15m': 500,
		'5m': 500,
		'1m': 500,
	},
	simulations: 5000, // 模拟次数
	volatility: 0.04, // 日波动率（比特币历史平均约3-5%）
	drift: 0.0002, // 每日趋势偏移量
	adxPeriod: 14,
	rsiPeriod: 14,
	marketMode: 1,
	isMarketModeAuto: false,
};

// 计算单期EMA
function calculateSingleEMA(currentValue, previousEMA, period = 20) {
	const k = 2 / (period + 1); // 平滑系数
	return currentValue * k + previousEMA * (1 - k);
}

// 计算成交量EMA(20)
function calculateVolumeEMA(candles, period = 20) {
	if (!candles || candles.length < period) {
		throw new Error(`至少需要${period}根K线数据`);
	}

	// 初始化：前period周期的SMA作为EMA起点
	let sum = 0;
	for (let i = 0; i < period; i++) {
		sum += candles[i].volume;
	}
	const initialSMA = sum / period;

	// 存储EMA结果
	const emaResults = [];

	// 第一期的EMA就是SMA
	emaResults.push({
		timestamp: candles[period - 1].timestamp,
		volumeEMA: initialSMA,
	});

	// 计算后续EMA值
	for (let i = period; i < candles.length; i++) {
		const currentVolume = candles[i].volume;
		const previousEMA = emaResults[emaResults.length - 1].volumeEMA;
		const currentEMA = calculateSingleEMA(
			currentVolume,
			previousEMA,
			period
		);

		emaResults.push({
			timestamp: candles[i].timestamp,
			volumeEMA: currentEMA,
		});
	}

	return emaResults;
}

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
			[config.fastframe]: [],
			merged: [],
		};
		this.trades = [];
		this.balance = config.initialBalance;
		this.totalFee = 0;
		this.maxBalance = this.balance;
		this.maxDrawdown = 0;
		this.continueWin = 0;
		this.continueLoss = 0;
		this.marketMode = config.marketMode;
		this.latestTradeProfits = [];
	}

	covariance(x, y) {
		if (!Array.isArray(x) || !Array.isArray(y)) {
			throw new Error('需要两个数组作为参数');
		}
		if (x.length !== y.length) {
			throw new Error('数组长度必须相同');
		}

		const n = x.length;
		const meanX = x.reduce((a, b) => a + b, 0) / n;
		const meanY = y.reduce((a, b) => a + b, 0) / n;

		return (
			x.reduce((acc, val, i) => acc + (val - meanX) * (y[i] - meanY), 0) /
			(n - 1)
		);
	}

	// // 多周期价格路径生成（带相关性）
	generateCorrelatedPaths(historicalData) {
		const paths = {};
		const tfs = Object.keys(historicalData);

		// 计算各周期收益率矩阵
		const returnsMatrix = tfs.map((tf) => {
			const closes = historicalData[tf].map((c) => c.close);
			return _.range(1, closes.length).map((i) =>
				Math.log(closes[i] / closes[i - 1])
			);
		});

		// 数据集
		// const data = math.matrix(returnsMatrix);

		// 构建协方差矩阵
		const covMatrix = math.variance(returnsMatrix);

		// Cholesky分解生成相关路径  cholesky
		const chol = math.chol(covMatrix);

		for (let s = 0; s < config.simulations; s++) {
			paths[s] = {};
			for (let tfi = 0; tfi < tfs.length; tfi++) {
				const tf = tfs[tfi];
				const basePrice = historicalData[tf][0].close;
				const path = [basePrice];

				for (let t = 1; t < historicalData[tf].length; t++) {
					const z = math.multiply(chol, math.random([tfs.length, 1]));
					const drift = 0.0002 * (t / 1440); // 时间加权利率
					const shock =
						z[tfi] *
						math.sqrt(
							config.emaSettings[config.slowframe].period / 20
						);
					path[t] = path[t - 1] * Math.exp(drift + shock);
				}
				paths[s][tf] = path;
			}
		}
		return paths;
	}

	// 时间轴对齐算法
	alignTimeframes(paths) {
		const masterTF = '5m'; // 以最短周期为基准
		const aligned = [];

		paths[masterTF].forEach((point, idx) => {
			const alignedTick = { [masterTF]: point };

			// 对齐更高周期
			config.timeframes
				.filter((tf) => tf !== masterTF)
				.forEach((tf) => {
					const ratio = this.getTimeframeRatio(masterTF, tf);
					alignedTick[tf] = paths[tf][Math.floor(idx / ratio)];
				});

			aligned.push(alignedTick);
		});

		return aligned;
	}

	// 时间周期转换比率
	getTimeframeRatio(baseTF, targetTF) {
		const tfMinutes = {
			'1m': 1,
			'5m': 5,
			'30m': 30,
			'1h': 60,
			'4h': 240,
			'1d': 1440,
		};
		return tfMinutes[targetTF] / tfMinutes[baseTF];
	}

	// 生成随机价格路径（几何布朗运动模型）
	generatePricePaths(historicalPrices) {
		const returns = [];
		for (let i = 1; i < historicalPrices.length; i++) {
			returns.push(
				Math.log(
					historicalPrices[i].close / historicalPrices[i - 1].close
				)
			);
		}

		const meanReturn = math.mean(returns);
		const stdReturn = math.std(returns);

		const paths = [];
		for (let s = 0; s < config.simulations; s++) {
			const path = [historicalPrices[0].close];
			for (let t = 1; t < historicalPrices.length; t++) {
				const shock = math.random(0, 1) * stdReturn + meanReturn;
				path[t] = path[t - 1] * Math.exp(shock);
			}
			paths.push(path);
		}
		return paths;
	}

	async loadHistoricalData(start, end, interval) {
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
							config.coldStartBars[tf]
						);

						if (candles.length === 0) break;

						allCandles = allCandles.concat(candles);
						currentSince = candles[candles.length - 1][0] + 1;

						// 限速处理
						await new Promise((resolve) =>
							setTimeout(resolve, 200)
						);
					}

					const paths = allCandles.map((c) => this.parseCandle(c));
					// paths = this.generatePricePaths(paths);
					this.data[tf] = paths;
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
		let i = 0;
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

	async calculateAdx(highs, lows, closes) {
		const result = await tulind.indicators.adx.indicator(
			[highs, lows, closes],
			[config.adxPeriod]
		);
		const di_result = await tulind.indicators.di.indicator(
			[highs, lows, closes],
			[config.adxPeriod]
		);
		return [result[0], di_result[0], di_result[1]];
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
						[config.emaSettings[tf].periods[0]]
					)
				);

				indicatorPromises.push(
					tulind.indicators.ema.indicator(
						[closes],
						[config.emaSettings[tf].periods[1]]
					)
				);

				indicatorPromises.push(
					tulind.indicators.ema.indicator(
						[closes],
						[config.emaSettings[tf].periods[2]]
					)
				);

				indicatorPromises.push(
					tulind.indicators.ema.indicator(
						[closes],
						[config.emaSettings[tf].periods[3]]
					)
				);

				indicatorPromises.push(
					tulind.indicators.ema.indicator(
						[closes],
						[config.emaSettings[tf].periods[4]]
					)
				);

				indicatorPromises.push(
					tulind.indicators.ema.indicator(
						[closes],
						[config.emaSettings[tf].periods[5]]
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

				indicatorPromises.push(this.calculateAdx(highs, lows, closes));

				indicatorPromises.push(
					tulind.indicators.rsi.indicator(
						[closes],
						[config.rsiPeriod]
					)
				);

				// 计算成交量EMA(20)
				const volumeEMA20List = calculateVolumeEMA(this.data[tf]);
				const volumeEMA20Promise = new Promise((resolve) => {
					resolve(volumeEMA20List);
				});
				indicatorPromises.push(volumeEMA20Promise);
			});

			const result = await Promise.all(indicatorPromises);

			// 合并指标到数据
			config.timeframes.forEach((tf, index) => {
				const [
					emaFast,
					emaSlow,
					emaTrend,
					ema4,
					ema5,
					ema6,
					bollinger,
					atr,
					macd,
					[adx, adxPlusDI, adxMinusDI],
					rsi,
					volumeEMA20,
				] = result.slice(index * 12, (index + 1) * 12);
				// if (tf === config.slowframe) {
				// 	console.log(
				// 		23,
				// 		this.data[tf].length,
				// 		adx.length,
				// 		adxPlusDI.length,
				// 		adxMinusDI.length,
				// 		atr[0].length,
				// 		rsi[0].length
				// 	);
				// }

				// 计算EMA斜率
				const emaSlowSlopes = [];
				const emaFastSlopes = [];
				const emaTrendSlopes = [];
				for (
					let i = config.emaSettings[tf].slopeWindow;
					i < emaSlow[0].length;
					i++
				) {
					const slope =
						(emaSlow[0][i] -
							emaSlow[0][
								i - config.emaSettings[tf].slopeWindow
							]) /
						emaSlow[0][i - config.emaSettings[tf].slopeWindow];
					emaSlowSlopes.push(slope);
				}
				for (
					let i = config.emaSettings[tf].slopeWindow;
					i < emaFast[0].length;
					i++
				) {
					const slope =
						(emaFast[0][i] -
							emaFast[0][
								i - config.emaSettings[tf].slopeWindow
							]) /
						emaFast[0][i - config.emaSettings[tf].slopeWindow];
					emaFastSlopes.push(slope);
				}
				for (
					let i = config.emaSettings[tf].slopeWindow;
					i < emaTrend[0].length;
					i++
				) {
					const slope =
						(emaTrend[0][i] -
							emaTrend[0][
								i - config.emaSettings[tf].slopeWindow
							]) /
						emaTrend[0][i - config.emaSettings[tf].slopeWindow];
					emaTrendSlopes.push(slope);
				}

				// 合并指标到数据
				this.data[tf].forEach((d, i) => {
					if (i >= config.bollinger.period) {
						const bbIndex = i - config.bollinger.period + 1;
						d.lower = bollinger[0][bbIndex];
						d.middle = bollinger[1][bbIndex];
						d.upper = bollinger[2][bbIndex];
						d.bandwidth = (d.upper - d.lower) / d.middle;
					}
					if (i >= config.emaSettings[tf].slopeWindow) {
						const slopeIndex =
							i - config.emaSettings[tf].slopeWindow;
						const zoomOut = 100000;
						d.emaSlowSlope = emaSlowSlopes[slopeIndex] * zoomOut;
						d.emaFastSlope = emaFastSlopes[slopeIndex] * zoomOut;
						d.emaTrendSlope = emaTrendSlopes[slopeIndex] * zoomOut;
					}
					if (i >= config.macdParams[tf][1]) {
						const macdIndex = i - config.macdParams[tf][1] + 1;
						d.macd = macd ? macd[0][macdIndex] : null;
						d.macdHistogram =
							macd[0][macdIndex] - macd[1][macdIndex] || null;
					}
					if (i >= config.atrParam.atrPeriod) {
						const atrIndex = i - config.atrParam.atrPeriod + 1;
						d.atr = atr[0][atrIndex];
					}
					if (i >= config.adxPeriod * 2) {
						// const offset = this.data[tf].length - adx[0].length;
						const adxIndex = i - config.adxPeriod * 2 + 2;
						const adxPlusDIIndex = i - config.adxPeriod + 1;

						d.adx = adx[adxIndex];
						d.adxPlusDI = adxPlusDI
							? adxPlusDI[adxPlusDIIndex]
							: null;
						d.adxMinusDI = adxMinusDI
							? adxMinusDI[adxPlusDIIndex]
							: null;
					}
					if (i >= config.rsiPeriod) {
						const rsiIndex = i - config.rsiPeriod;
						d.rsi = rsi[0][rsiIndex];
					}
					d.emaFast = Number(emaFast[0][i].toFixed(8));
					d.emaSlow = Number(emaSlow[0][i].toFixed(8));
					d.emaTrend = Number(emaTrend[0][i].toFixed(8));
					d.ema4 = Number(ema4[0][i].toFixed(8));
					d.ema5 = Number(ema5[0][i].toFixed(8));
					d.ema6 = Number(ema6[0][i].toFixed(8));
					if (i >= 19) {
						d.volumeEMA20 = volumeEMA20[i - 19].volumeEMA;
					}

					// d.adx = adx[0][i];
					if (d.adx && d.atr) {
						const volatility_ratio = d.atr / d.emaSlow;
						const isVolatility = volatility_ratio > 0.01;
						// const isVolatility = adx > 30;
						d.rsi_long = isVolatility ? 48 : 58;
						d.rsi_short = isVolatility ? 58 : 48;
						// d.rsi_long = d.adx > 40 ? 42 : d.adx > 30 ? 48 : 58;
						// d.rsi_short = d.adx > 40 ? 64 : d.adx > 30 ? 58 : 42;
						d.stop_multiplier = isVolatility ? 3 : 2.5;
						d.profit_multiplier = isVolatility ? 2 : 2;
						d.adx_threshold = isVolatility ? 30 : 25;
						d.adx_stoploss_distance = isVolatility ? 5 : 3;
						d.volatility_ratio = volatility_ratio;
						d.isVolatility = isVolatility;

						d.is_latest_has_rsi_long = this.data[tf]
							.slice(i - 4, i + 1)
							.some((it) => it.rsi < it.rsi_long);
						d.is_latest_has_rsi_short = this.data[tf]
							.slice(i - 4, i + 1)
							.some((it) => it.rsi > it.rsi_short);

						d.stopLoss = d.atr * d.stop_multiplier;
						d.takeProfit = d.atr * d.profit_multiplier;
						// d.takeProfit = isVolatility ? d.stopLoss * 1.5 : d.stopLoss * 1.2;
					}
					d.marketType = this.getMarketType(
						d,
						this.data[tf][i - 1],
						this.data[tf][i - 2]
					);
				});
			});
		} catch (e) {
			console.error('指标计算错误:', e);
		}
	}

	// getMarketType(candle, lastCandle, lastLastCandle) {
	// 	const {
	// 		close,
	// 		high,
	// 		low,
	// 		volume,
	// 		emaFast,
	// 		emaSlow,
	// 		emaTrend,
	// 		atr,
	// 		adx,
	// 		volumeEMA20,
	// 	} = candle;

	// 	const {
	// 		close: lastClose,
	// 		high: lastHigh,
	// 		emaFast: lastEmaFast,
	// 		emaSlow: lastEmaSlow,
	// 	} = lastCandle || {};

	// 	// 动态波动率调整
	// 	const volatilityFactor = atr / close;

	// 	const isFaraway = Math.abs(emaSlow - emaTrend) / emaTrend > atr;

	// 	// 趋势判断
	// 	if (emaFast > emaTrend) {
	// 		// 多头增强条件
	// 		const isPullback = close < emaFast && close > lastClose;
	// 		const isBreakout =
	// 			close > emaFast &&
	// 			emaFast > emaSlow &&
	// 			emaSlow > emaTrend &&
	// 			(lastClose < emaFast || lastClose < emaSlow);

	// 		// const isBreakout = emaFast > emaSlow && lastEmaFast < lastEmaSlow;

	// 		if (isBreakout) return '趋势多且增强_DOGE_UP_BREAKOUT'; // 强势突破
	// 		if (isPullback) return '趋势多且增强_DOGE_UP_PULLBACK';

	// 		// if (emaFast < emaSlow || emaFast < emaTrend) {
	// 		// 	return '趋势空';
	// 		// }

	// 		// if (emaFast < emaSlow && lastEmaFast > lastEmaSlow) {
	// 		// 	return '趋势空';
	// 		// }
	// 		return '趋势多_DOGE_UP_BASE';
	// 		// return 'DOGE_NOISE';
	// 	}

	// 	if (emaFast < emaTrend) {
	// 		// 空头增强条件
	// 		const isPullback = close > emaFast && close < lastClose;
	// 		const isBreakout =
	// 			close < emaFast &&
	// 			emaFast < emaSlow &&
	// 			emaSlow < emaTrend &&
	// 			(lastClose > emaFast || lastClose > emaSlow);

	// 		// const isBreakout = emaFast < emaSlow && lastEmaFast > lastEmaSlow;

	// 		if (isBreakout && isFaraway)
	// 			return '趋势空且增强_DOGE_DOWN_BREAKOUT';
	// 		if (isPullback && isFaraway)
	// 			return '趋势空且增强_DOGE_DOWN_PULLBACK';

	// 		// if (emaFast > emaSlow || emaFast > emaTrend) {
	// 		// 	return '趋势多';
	// 		// }

	// 		// if (emaFast > emaSlow && lastEmaFast < lastEmaSlow) {
	// 		// 	return '趋势多';
	// 		// }
	// 		return '趋势空_DOGE_DOWN_BASE';
	// 		// return 'DOGE_NOISE';
	// 	}

	// 	return 'DOGE_NOISE';
	// }

	getMarketType(candle, lastCandle, lastLastCandle) {
		let marketType = '';
		if (!lastCandle) return marketType;
		if (!lastLastCandle) return marketType;

		const {
			adx,
			adxPlusDI,
			adxMinusDI,
			rsi,
			close,
			high,
			low,
			atr,
			open,
			emaSlope,
			emaFast,
			emaSlow,
			emaTrend,
			ema4,
			ema5,
			ema6,
			macdHistogram: macd,
			volume,
			rsi_long,
			rsi_short,
			stop_multiplier,
			adx_threshold,
			adx_stoploss_distance,
			volatility_ratio,
			emaSlowSlope,
			emaFastSlope,
			emaTrendSlope,
		} = candle;
		const {
			emaFast: lastEmaFast,
			emaSlow: lastEmaSlow,
			emaTrend: lastEmaTrend,
			close: lastClose,
			high: lastHigh,
			low: lastLow,
			open: lastOpen,
			macdHistogram: lastMacd,
			volume: lastVolume,
		} = lastCandle;
		const {
			emaFast: lastLastEmaFast,
			emaSlow: lastLastEmaSlow,
			close: lastLastClose,
			macdHistogram: lastLastMacd,
			volume: lastLastVolume,
		} = lastLastCandle;

		const stronger = emaFast > emaSlow;
		const weeker = emaFast < emaSlow;

		let longCondition = false;
		let shortCondition = false;
		let longCloseCondition = false;
		let shortCloseCondition = false;
		const { marketMode } = this;

		longCondition =
			emaFast < emaSlow &&
			lastEmaFast > lastEmaSlow &&
			emaTrend > ema5 &&
			ema4 > ema6 &&
			close > ema5;

		shortCondition =
			emaFast > emaSlow &&
			lastEmaFast < lastEmaSlow &&
			emaTrend < ema5 &&
			ema4 < ema6 && close < ema5;

		longCloseCondition = close < ema5 || emaTrend < ema5;
		shortCloseCondition = close > ema5 || emaTrend > ema5;

		// if (marketMode == 2) {
		// 	longCondition = emaFast > emaSlow && emaTrend > ema5 && ema4 > ema6;
		// 	shortCondition =
		// 		emaFast < emaSlow && emaTrend < ema5 && ema4 < ema6;
		// }

		// if (shouldFilter) {
		// 	marketType = '趋势多趋势空-EMA过于接近被过滤';
		// }

		// if (!shouldFilter) {
		// 	// 获取信号强度
		// 	const strength = await emaFilter.getSignalStrengthWithATR(
		// 		slowEmaFast,
		// 		slowEmaSlow,
		// 		marketData[config.slowframe]
		// 	);
		// 	if (strength === 'filtered') {
		// 	}
		// }

		if (longCloseCondition) marketType = '趋势空';
		if (shortCloseCondition) marketType = '趋势多';
		if (longCondition) marketType = '趋势多且增强';
		if (shortCondition) marketType = '趋势空且增强';

		// if (close > emaSlow) {
		// 	marketType = '趋势多';
		// 	if (
		// 		close > emaTrend &&
		// 		emaFastSlope > 0 &&
		// 		emaSlowSlope > 0 &&
		// 		emaTrendSlope > 0 &&
		// 		high > lastHigh &&
		// 		adx > adx_threshold - 7
		// 	)
		// 		marketType = '趋势多且增强';
		// }

		// if (close < emaSlow) {
		// 	marketType = '趋势空';
		// 	if (
		// 		close < emaTrend &&
		// 		emaFastSlope < 0 &&
		// 		emaSlowSlope < 0 &&
		// 		emaTrendSlope < 0 &&
		// 		low < lastLow &&
		// 		adx > adx_threshold - 7
		// 	)
		// 		marketType = '趋势空且增强';
		// }

		// // 动态波动率调整
		// const volatilityFactor = atr / close;
		// const isFaraway = (Math.abs(emaFast - emaSlow) / emaSlow) * 100 < 0.5;

		// if (emaFast > emaSlow) {
		// 	marketType = '趋势多';
		// 	if (emaSlow > emaTrend) {
		// 		if (close > emaFast && close < lastClose) {
		// 			marketType = '趋势多且增强-L-1-1';
		// 		}
		// 		if (close > emaTrend && lastClose < lastEmaTrend) {
		// 			marketType = '趋势多且增强-L-1-2';
		// 		}
		// 		const isBreakout =
		// 			close > emaFast &&
		// 			emaFast > emaSlow &&
		// 			emaSlow > emaTrend &&
		// 			(lastClose < lastEmaFast || lastClose < lastEmaSlow);
		// 		if (isBreakout) marketType = '趋势多且增强-L-1-3';
		// 	}
		// }

		// if (emaFast < emaSlow) {
		// 	marketType = '趋势空';
		// 	if (emaSlow < emaTrend) {
		// 		if (close < emaFast && close > lastClose) {
		// 			marketType = '趋势空且增强-R-1-1';
		// 		}
		// 		if (close < emaTrend && lastClose > lastEmaTrend) {
		// 			marketType = '趋势空且增强-R-1-2';
		// 		}
		// 		const isBreakout =
		// 			close < emaFast &&
		// 			emaFast < emaSlow &&
		// 			emaSlow < emaTrend &&
		// 			(lastClose > lastEmaFast || lastClose > lastEmaSlow);
		// 		if (isBreakout) marketType = '趋势空且增强-R-1-3';
		// 	}
		// }

		return marketType;
	}

	toogleMarketType(marketType, candle) {
		const { adx, adx_threshold } = candle;
		// if (adx < adx_threshold) {
		// if (this.marketMode == 2) {
		// 	if (marketType.indexOf('多') != -1) {
		// 		marketType = marketType.replace('多', '空');
		// 	} else if (marketType.indexOf('空') != -1) {
		// 		marketType = marketType.replace('空', '多');
		// 	}
		// }
		// }
		// if (this.marketMode == 2) {
		// 	if (marketType.indexOf('多') != -1) {
		// 		marketType = marketType.replace('多', '空');
		// 	} else if (marketType.indexOf('空') != -1) {
		// 		marketType = marketType.replace('空', '多');
		// 	}

		// 	if (marketType.indexOf('且增强') == -1) {
		// 		marketType = '';
		// 	}
		// }

		return marketType;
	}

	getPositionSize(price, marketType) {
		const riskAmount = this.balance * config.riskPerTrade;
		// return riskAmount / (atr * config.leverage);
		// const profitRateMap = {
		// 	'趋势空且增强-1': 67.86,
		// 	'趋势多且增强-7': 67.04,
		// 	'趋势空且增强-11': 60.96,
		// 	'趋势空且增强-2': 59.04,
		// 	'趋势多且增强-3': 58.33,
		// 	'趋势多且增强-8': 56.36,
		// 	'趋势多且增强-4': 55.67,
		// 	'趋势多且增强-11': 54.95,
		// 	'趋势多且增强-1': 46.08,
		// 	'趋势空且增强-4': 46.05,
		// 	'趋势空且增强-7': 43.89,
		// 	'趋势多且增强-2': 39.12,
		// 	'趋势多且增强-10': 38.89,
		// 	'趋势空且增强-3': 36.84,
		// 	'趋势多且增强-6': 34.06,
		// 	'趋势多且增强-5': 23.68,
		// };
		const profitRateMap = {
			'趋势空且增强-L2-1-3': 77.94,
			'趋势多且增强-R-2-2': 73.08,
			'趋势多且增强-R-1-1-1': 70.27,
			'趋势空且增强-L2-2-3': 69.05,
			'趋势多且增强-R-1-2-2': 67.8,
			'趋势多且增强-L3-1-5': 67.0,
			'趋势空且增强-L1-1-2': 64.86,
			'趋势多且增强-L3-1-4-1': 63.13,
			'趋势空且增强-11': 62.8,
			'趋势多且增强-L3-1-4-3': 60.48,
			'趋势空且增强-L2-3-3': 59.25,
			'趋势多且增强-R-2-1': 58.9,
			'趋势多且增强-R-3-2': 58.82,
			'趋势多且增强-R-3-1': 58.33,
			'趋势空且增强-L2-3-4': 57.66,
			'趋势多且增强-L1-2-1': 57.14,
			'趋势空且增强-L2-3-5': 56.63,
			'趋势多且增强-R-1-1-2': 56.6,
			'趋势空且增强-2': 53.92,
			'趋势多且增强-11': 50.71,
			'趋势多且增强-L3-1-3': 50.38,
			'趋势多且增强-L1-3-9': 47.06,
			'趋势多且增强-L1-1-6': 46.43,
			'趋势多且增强-L1-2-2': 45.45,
			'趋势多且增强-L1-3-2': 40.63,
			'趋势多且增强-L1-3-1': 40.0,
			'趋势多且增强-L1-3-4': 39.67,
			'趋势空且增强-L3-1-6': 37.8,
			'趋势多且增强-L1-2-5': 36.25,
			'趋势空且增强-L-4-2-3': 61.18,
		};
		const newBalance =
			(config.initialBalance * profitRateMap[marketType]) / 100;
		// return newBalance / price;
		return config.initialBalance / price;
		// return (this.balance * 0.8) / price;
	}

	getLongShort(dataList, index, WindowTreshold) {
		const longs = dataList
			.slice(index - WindowTreshold + 1, index + 1)
			.filter((item) => item.close > item.open);
		const shorts = dataList
			.slice(index - WindowTreshold + 1, index + 1)
			.filter((item) => item.close < item.open);
		return { longs, shorts };
	}

	runBacktest() {
		let position = null;
		// let atr = 0;

		this.data[config.fastframe].forEach(async (d, index) => {
			// 跳过前50根K线确保指标稳定
			if (index < 30) return;
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

			const isLastIndex =
				index === this.data[config.fastframe].length - 1;

			const lastKline5M = JSON.parse(
				JSON.stringify(this.data[config.fastframe][index])
			);

			const secondKline5M = JSON.parse(
				JSON.stringify(this.data[config.fastframe][index - 1])
			);

			const candle = {
				// [config.slowframe]: this.getTimeStampBefore(
				// 	this.data[config.slowframe],
				// 	lastKline5M.timestamp
				// ),
				// [config.slowframe]: lastKline5M,
				[config.fastframe]: lastKline5M,
			};

			const { marketType: fastMarketType } = candle[config.fastframe];
			let { marketType: slowMarketType } = candle[config.slowframe];

			// if (!position)
			slowMarketType = this.toogleMarketType(slowMarketType, d);

			// 生成信号
			const signal = this.generateSignal(
				candle,
				secondKline5M,
				fastMarketType,
				slowMarketType
			);

			let stopLossDirection = null;

			// 处理平仓
			if (position) {
				const lnp = this.getLnp(position, d);
				const duration = this.getTimeInterval(position, d);

				let isProfitTarget = false;
				let isStopLoss = false;

				if (
					position.slowMarketType.indexOf('DOGE_UP_BREAKOUT') !== -1
				) {
					isProfitTarget =
						d.close >= position.close + position.atr * 2.5;
					isStopLoss = d.close <= position.low - position.atr * 0.7;
				}

				if (
					position.slowMarketType.indexOf('DOGE_DOWN_BREAKOUT') !== -1
				) {
					isProfitTarget =
						d.close <= position.close - position.atr * 3;
					isStopLoss = d.close >= position.high + position.atr * 0.8;
				}

				if (
					position.slowMarketType.indexOf('DOGE_UP_PULLBACK') !== -1
				) {
					isProfitTarget = d.close >= position.emaSlow * 1.15;
					isStopLoss = d.close <= position.low - position.atr * 0.3;
				}

				if (
					position.slowMarketType.indexOf('DOGE_DOWN_PULLBACK') !== -1
				) {
					isProfitTarget = d.close <= position.emaSlow * 0.85;
					isStopLoss = d.close >= position.high + position.atr * 0.3;
				}

				const basicLnp = (0.01 * 1.5) / 4;
				isProfitTarget = lnp > basicLnp * 3.5;
				isStopLoss = lnp < -basicLnp;

				// const isProfitTarget =
				// 	position.marketMode === 1
				// 		? lnp > 0.015 * 1.25
				// 		: lnp > 0.015 * 1.25;

				// const isStopLoss = lnp < -0.015;

				if (isStopLoss) stopLossDirection = position.direction;

				const takeProfit = d.atr * config.atrParam.takeProfit;
				const stopLoss = d.atr * d.stop_multiplier;

				// const takeProfit = d.takeProfit;
				// const stopLoss = d.stopLoss;

				// const isProfitTarget =
				// 	position.direction === 'long'
				// 		? d.close >= position.entryPrice + takeProfit &&
				// 		  d.emaFast < d.emaSlow
				// 		: d.close <= position.entryPrice - takeProfit &&
				// 		  d.emaFast > d.emaSlow;

				// const isStopLoss =
				// 	position.direction === 'long'
				// 		? d.close <= position.entryPrice - stopLoss
				// 		: d.close >= position.entryPrice + stopLoss;

				// console.log(
				// 	233,
				// 	position.direction,
				// 	d.close,
				// 	d.emaFast,
				// 	position.entryPrice,
				// 	d.atr,
				// 	stopLoss,
				// 	position.entryPrice - stopLoss,
				// 	d.close <= position.entryPrice - stopLoss
				// );

				// const isReverse =
				// 	position.direction === 'long'
				// 		? d.emaSlope < -config.emaSlope.emaSlopeThreshold
				// 		: d.emaSlope > config.emaSlope.emaSlopeThreshold;

				// const isReverse =
				// 	signal &&
				// 	((position.direction === 'long'
				// 		? signal.direction === 'short'
				// 		: signal.direction === 'long') ||
				// 		(false && (isStopLoss || isProfitTarget)));

				const longCloseConditions = [
					// position.slowMarketType.indexOf('趋势多且增强') !== -1 &&
					// 	position.adx - adx > 5,
					position.slowMarketType.indexOf('趋势多且增强') !== -1 &&
						slowMarketType.indexOf('趋势空') !== -1,
					position.slowMarketType === '趋势潜在增强' &&
						[
							'超买市',
							'趋势空且增强',
							'潜在转折空',
							'震荡市开空',
							'趋势潜在减弱',
							'趋势多且减弱',
							'不确定',
							'趋势多只平不开',
						].includes(slowMarketType),
					position.slowMarketType === '震荡市开多' &&
						[
							'超买市',
							'趋势空且增强',
							'潜在转折空',
							'震荡市开空',
							'趋势潜在减弱',
							'趋势多且减弱',
							'不确定',
							'趋势多只平不开',
						].includes(slowMarketType),
					position.slowMarketType === '潜在转折多' &&
						[
							'超买市',
							'趋势空且增强',
							'潜在转折空',
							'震荡市开空',
							'趋势潜在减弱',
							'趋势多且减弱',
							'不确定',
							'趋势多只平不开',
						].includes(slowMarketType),
				];

				const shortCloseConditions = [
					// position.slowMarketType.indexOf('趋势空且增强') !== -1 &&
					// 	position.adx - adx > 5,
					position.slowMarketType.indexOf('趋势空且增强') !== 1 &&
						slowMarketType.indexOf('趋势多') !== -1,
					position.slowMarketType === '趋势潜在减弱' &&
						[
							'超卖市',
							'趋势多且增强',
							'潜在转折多',
							'震荡市开多',
							'趋势潜在增强',
							'趋势空且减弱',
							'不确定',
							'趋势空只平不开',
						].includes(slowMarketType),
					position.slowMarketType === '震荡市开空' &&
						[
							'超卖市',
							'趋势多且增强',
							'潜在转折多',
							'震荡市开多',
							'趋势潜在增强',
							'趋势空且减弱',
							'不确定',
							'趋势空只平不开',
						].includes(slowMarketType),
					position.slowMarketType === '潜在转折空' &&
						[
							'超卖市',
							'趋势多且增强',
							'潜在转折多',
							'震荡市开多',
							'趋势潜在增强',
							'趋势空且减弱',
							'不确定',
							'趋势空只平不开',
						].includes(slowMarketType),
				];

				const isReverse =
					// isLastIndex ||
					isProfitTarget ||
					isStopLoss ||
					// (lnp < 0 && duration >= 60) ||
					(position.direction === 'long'
						? longCloseConditions.some((c) => !!c)
						: shortCloseConditions.some((c) => !!c));

				if (isReverse) {
					this.closePosition(
						position,
						d,
						fastMarketType,
						slowMarketType,
						isStopLoss
					);
					position = null;
				}
			}

			// 处理开仓
			if (!position) {
				// console.log(
				// 	config.fastframe,
				// 	Object.assign(candle[config.fastframe], {
				// 		timestamp: moment(
				// 			candle[config.fastframe].timestamp
				// 		).format('YYYY-MM-DD HH:mm:ss'),
				// 	})
				// );
				// console.log(
				// 	config.slowframe,
				// 	Object.assign(candle[config.slowframe], {
				// 		timestamp: moment(
				// 			candle[config.slowframe].timestamp
				// 		).format('YYYY-MM-DD HH:mm:ss'),
				// 	})
				// );
				if (signal.direction) {
					position = this.openPosition(
						d,
						d.atr,
						signal.direction,
						fastMarketType,
						slowMarketType
					);
				} else if (isStopLoss) {
					// position = this.openPosition(
					// 	d,
					// 	d.atr,
					// 	stopLossDirection === 'long' ? 'short' : 'long',
					// 	fastMarketType,
					// 	slowMarketType
					// );
				}
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

	generateSignal(candle, secondKline5M, fastMarketType, slowMarketType) {
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
		const longConditions = [
			slowMarketType.indexOf('趋势多且增强') !== -1,
			slowMarketType === '趋势潜在增强',
			slowMarketType === '震荡市开多',
			slowMarketType === '潜在转折多',
		];
		const shortConditions = [
			slowMarketType.indexOf('趋势空且增强') !== -1,
			slowMarketType === '趋势潜在减弱',
			slowMarketType === '震荡市开空',
			slowMarketType === '潜在转折空',
		];

		const longCondition = longConditions.some((condition) => !!condition);
		const shortCondition = shortConditions.some((condition) => !!condition);

		// 多头信号
		if (longCondition) {
			return {
				direction: 'long',
				// direction: candle[config.slowframe].adx > 20 ? 'long' : 'short',
			};
		}

		// 空头信号
		if (shortCondition) {
			return {
				direction: 'short',
				// direction: candle[config.slowframe].adx > 20 ? 'short' : 'long',
			};
		}

		return { direction: null };
	}

	openPosition(candle, atr, direction, fastMarketType, slowMarketType) {
		const positionSize = this.getPositionSize(candle.close, slowMarketType);
		const fee =
			positionSize * candle.close * (config.feeRate + config.slippage);

		const position = Object.assign(candle, {
			entryPrice: candle.close,
			entryTime: candle.timestamp,
			direction: direction,
			size: positionSize,
			takeProfit: atr * config.atrParam.takeProfit,
			stopLoss: atr * config.atrParam.stopLoss,
			fastMarketType,
			slowMarketType,
			marketMode: this.marketMode,
		});

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

	getLnp(position, exitCandle) {
		const lnp =
			(exitCandle.close - position.entryPrice) / position.entryPrice;
		return position.direction === 'long' ? lnp : -lnp;
	}

	getTimeInterval(position, exitCandle) {
		const { entryTime } = position;
		const { timestamp } = exitCandle;
		const duration = (timestamp - entryTime) / (1000 * 60);
		return duration;
	}

	closePosition(
		position,
		exitCandle,
		fastMarketType,
		slowMarketType,
		isMarketOrder = false
	) {
		const fee =
			position.size *
			exitCandle.close *
			(config.feeRate + config.slippage);
		const profit =
			position.direction === 'long'
				? (exitCandle.close - position.entryPrice) * position.size
				: (position.entryPrice - exitCandle.close) * position.size;
		const positionSize = position.size * exitCandle.close;

		this.balance += profit - fee;
		this.totalFee += fee;
		this.trades.push({
			positionSize,
			size: position.size,
			direction: position.direction,
			entry: position.entryPrice,
			exit: exitCandle.close,
			profit: profit - fee,
			// fee,
			// entryMarketType: `${position.fastMarketType},${position.slowMarketType}`,
			// exitMarketType: `${fastMarketType},${slowMarketType}`,
			entryMarketType: `${position.slowMarketType}`,
			exitMarketType: `${slowMarketType}`,
			entryAdx: `${position.adx}`,
			exitAdx: `${exitCandle.adx}`,
			entryRSI: `${position.rsi}`,
			exitRSI: `${exitCandle.rsi}`,
			entryAdxPlusDI: `${position.adxPlusDI}`,
			entryAdxMinusDI: `${position.adxMinusDI}`,
			exitAdxPlusDI: `${exitCandle.adxPlusDI}`,
			exitAdxMinusDI: `${exitCandle.adxMinusDI}`,
			entryVolatilityRatio: `${position.volatility_ratio}`,
			exitVolatilityRatio: `${exitCandle.volatility_ratio}`,
			entryMacd: `${position.macdHistogram}`,
			exitMacd: `${exitCandle.macdHistogram}`,
			entryEmaFast: `${position.emaFast}`,
			entryEmaSlow: `${position.emaSlow}`,
			exitEmaFast: `${exitCandle.emaFast}`,
			exitEmaSlow: `${exitCandle.emaSlow}`,
			entryEmaSlope: `${position.emaSlope}`,
			exitEmaSlope: `${exitCandle.emaSlope}`,
			// duration: `${(
			// 	(exitCandle.timestamp - position.entryTime) /
			// 	(1000 * 60 * 60)
			// ).toFixed(1)}h`,
			entryTime: moment(position.entryTime).format('YYYY-MM-DD HH:mm:ss'),
			exitTime: moment(exitCandle.timestamp).format(
				'YYYY-MM-DD HH:mm:ss'
			),
			marketMode: this.marketMode,
		});

		// 计算最大回撤
		this.maxBalance = Math.max(this.maxBalance, this.balance);
		const drawdown = (this.maxBalance - this.balance) / this.maxBalance;
		this.maxDrawdown = Math.max(this.maxDrawdown, drawdown);

		if (profit > 0) {
			this.continueWin++;
			this.continueLoss = 0;
		} else {
			this.continueWin = 0;
			this.continueLoss++;
		}

		this.latestTradeProfits.push(profit);
		const preholder = 3;
		if (this.latestTradeProfits.length > preholder) {
			this.latestTradeProfits.shift();

			const winTotal = this.latestTradeProfits
				.filter((p) => p > 0)
				.reduce((a, b) => a + b, 0);
			const lossTotal = this.latestTradeProfits
				.filter((p) => p < 0)
				.reduce((a, b) => a + b, 0);

			const winNum = this.latestTradeProfits.filter((p) => p > 0).length;
			const lossNum = this.latestTradeProfits.filter((p) => p < 0).length;

			const { continueWin, continueLoss, marketMode } = this;
			// if (lossTotal < winTotal) {
			// 	this.marketMode = marketMode === 1 ? 2 : 1;
			// 	config.marketMode = this.marketMode;
			// }
			// if (lossNum > winNum) {
			// 	this.marketMode = marketMode === 1 ? 2 : 1;
			// 	config.marketMode = this.marketMode;
			// }
		}
		const lnp = this.getLnp(position, exitCandle);
		const { marketMode } = this;
		if (config.isMarketModeAuto) {
			const basicLnp = (0.01 * 1.5) / 4;
			if (marketMode == 2 && lnp < -basicLnp) {
				this.marketMode = 1;
			} else if (marketMode == 1 && lnp < -basicLnp) {
				this.marketMode = 2;
			}
		}
		config.marketMode = this.marketMode;
	}

	calContinueWinLoss(trades) {
		let winCount = 0;
		let lossCount = 0;
		let maxWinCount = 0;
		let maxLossCount = 0;
		let continueWin = 0;
		let continueLoss = 0;
		let maxContinueWin = 0;
		let maxContinueLoss = 0;
		trades.forEach((t) => {
			if (t.profit > 0) {
				winCount++;
				lossCount = 0;
				continueLoss = 0;
				continueWin += t.profit;
			} else {
				winCount = 0;
				continueWin = 0;
				lossCount++;
				continueLoss += t.profit;
			}
			maxWinCount = Math.max(maxWinCount, winCount);
			maxLossCount = Math.max(maxLossCount, lossCount);
			maxContinueWin = Math.max(maxContinueWin, continueWin);
			maxContinueLoss = Math.min(maxContinueLoss, continueLoss);
		});
		return {
			maxWinCount,
			maxLossCount,
			maxContinueWin,
			maxContinueLoss,
		};
	}

	calcTrades(trades) {
		const wins = trades.filter((t) => t.profit > 0);
		const losses = trades.filter((t) => t.profit <= 0);

		const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
		const winRate = ((wins.length / trades.length) * 100 || 0).toFixed(2);
		const profitFactor =
			wins.reduce((s, t) => s + t.profit, 0) /
			Math.abs(losses.reduce((s, t) => s + t.profit, 0));

		const winsTotal = wins.reduce((s, t) => s + t.profit, 0);
		const lossesTotal = Math.abs(losses.reduce((s, t) => s + t.profit, 0));

		const winPositionTotal = wins.reduce((s, t) => s + t.positionSize, 0);
		const lossPositionTotal = Math.abs(
			losses.reduce((s, t) => s + t.positionSize, 0)
		);

		const rw = winsTotal / winPositionTotal;
		const rl = lossesTotal / lossPositionTotal;

		return Object.assign(
			{
				wins,
				losses,
				totalProfit,
				winRate,
				profitFactor,
				rw,
				rl,
			},
			this.calContinueWinLoss(trades)
		);
	}

	showResults(startTime) {
		const {
			wins,
			losses,
			totalProfit,
			winRate,
			profitFactor,
			maxContinueWin,
			maxContinueLoss,
			maxWinCount,
			maxLossCount,
		} = this.calcTrades(this.trades);

		const profitTotal = this.balance - config.initialBalance;

		const whiteFields = [
			// 'positionSize',
			// 'size',
			'direction',
			'entryMarketType',
			'profit',
			'exitMarketType',
			'entryAdx',
			'entryAdxPlusDI',
			'entryAdxMinusDI',
			'entryEmaFast',
			'entryEmaSlow',
			'entry',
			'exit',
			'entryMacd',
			'entryRSI',
			'entryVolatilityRatio',
			'exitAdx',
			'exitAdxPlusDI',
			'exitAdxMinusDI',
			'exitEmaFast',
			'exitEmaSlow',
			'entryEmaSlope',
			'entryTime',
			'exitTime',
			'marketMode',
		];
		const filterTable = [];
		this.trades.forEach((t) => {
			const target = {};
			whiteFields.forEach((field) => {
				target[field] = t[field];
			});
			filterTable.push(target);
		});

		console.table(filterTable);

		const maxLoss = Math.min(...this.trades.map((t) => t.profit)).toFixed(
			2
		);

		console.log(`
      ========== 回测结果 ==========
      总交易次数:     ${this.trades.length}
      盈利次数:       ${wins.length}
      亏损次数:       ${losses.length}
      胜率:          ${winRate}%
      总收益:        ${totalProfit.toFixed(2)} USDT
      期末余额:      ${this.balance.toFixed(2)} USDT
      盈亏比:        ${profitFactor.toFixed(2)}
      最大单笔盈利:  ${Math.max(...this.trades.map((t) => t.profit)).toFixed(2)}
      最大单笔亏损:  ${maxLoss}
      手续费:       ${this.totalFee}
      最大连续盈利:  ${maxContinueWin}
      最大连续亏损:  ${maxContinueLoss}
      最大连盈次数:  ${maxWinCount}
      最大连亏次数:  ${maxLossCount}
      =============================
    `);
		console.log('profit:', profitTotal);
		console.log('maxDrawdown', `${(this.maxDrawdown * 100).toFixed(1)}%`);
		console.log('startTime:', startTime.format('YYYY-MM-DD HH:mm:ss'));

		const profitMap = this.genEveryTypeProfit();

		formatProfitMap(profitMap);

		return {
			winRate,
			maxLoss,
			maxDrawdown: (this.maxDrawdown * 100).toFixed(1),
			profitMap,
			tradeNum: this.trades.length,
			trades: this.trades,
		};
	}

	genEveryTypeProfit() {
		const profitMap = new Map();
		this.trades.forEach((trade) => {
			const key = `${trade.entryMarketType}`;
			profitMap[key] = profitMap[key] || [];
			profitMap[key].push(trade.profit);
		});
		return profitMap;
	}
}

function carryForluma(p, rl, rw) {
	const f = p / rl - (1 - p) / rw;
	return f;
}

// 执行回测
(async () => {
	const backtester = new Backtester();
	// const start = '2023-01-01';
	// const end = '2023-07-01';
	const start = '2025-10-01';
	const end = '2025-10-30';
	const interval = 30;
	let profitTotal = 0;
	let maxLossTotal = 0;
	let winRateTotal = 0;
	let maxDrawdownTotal = 0;
	let profitMapTotal = {};
	let tradeNumTotal = 0;
	let totalTrades = [];

	let i = 0;
	let loop = 1;
	let startTime = moment(start).add(i, 'days');
	// while (moment(end).isAfter(startTime)) {
	while (i === 0) {
		loop += 1;
		try {
			backtester.data = {
				[config.slowframe]: [],
				[config.fastframe]: [],
				merged: [],
			};
			backtester.trades = [];
			backtester.balance = config.initialBalance;
			backtester.totalFee = 0;
			backtester.maxBalance = config.initialBalance;
			backtester.maxDrawdown = 0;
			backtester.marketMode = config.marketMode;

			// 步骤1: 加载历史数据
			const data = await backtester.loadHistoricalData(
				moment(start).add(i, 'days').format('YYYY-MM-DD'),
				moment(start)
					.add(i + interval, 'days')
					.format('YYYY-MM-DD'),
				interval
			);

			// 生成相关价格路径
			// const simPaths = backtester.generateCorrelatedPaths(data);
			// console.log(simPaths);

			// 步骤2: 计算指标
			await backtester.calculateIndicators();

			// console.log(
			// 	data[config.slowframe]
			// 		// .filter(
			// 		// 	(item) =>
			// 		// 		moment(item.timestamp).isAfter(
			// 		// 			moment('2023-04-03 23:00:00')
			// 		// 		) &&
			// 		// 		moment(item.timestamp).isBefore(
			// 		// 			moment('2023-04-04 02:00:00')
			// 		// 		)
			// 		// )
			// 		.filter(
			// 			(item) =>
			// 				moment(item.timestamp).isAfter(
			// 					moment('2025-07-10 23:00:00')
			// 				) &&
			// 				moment(item.timestamp).isBefore(
			// 					moment('2025-07-11 10:00:00')
			// 				)
			// 		)
			// 		.map((candle) =>
			// 			Object.assign(candle, {
			// 				timestamp: moment(candle.timestamp).format(
			// 					'YYYY-MM-DD HH:mm:ss'
			// 				),
			// 			})
			// 		)
			// );

			// console.log(data[config.slowframe].length);

			// 步骤3: 运行回测
			backtester.runBacktest();

			// 步骤4: 显示结果
			const {
				winRate,
				maxLoss,
				maxDrawdown,
				profitMap,
				tradeNum,
				trades,
			} = backtester.showResults(startTime);
			totalTrades.push(...trades);
			maxLossTotal = Math.min(maxLossTotal, Number(maxLoss));
			winRateTotal += Number(winRate);
			maxDrawdownTotal = Math.max(maxDrawdownTotal, Number(maxDrawdown));
			tradeNumTotal += tradeNum;

			profitTotal += backtester.balance - config.initialBalance;

			Object.entries(profitMap).forEach(([key, value]) => {
				profitMapTotal[key] = profitMapTotal[key] || [];
				profitMapTotal[key].push(...value);
			});

			i += interval;

			startTime = moment(start).add(i, 'days');
		} catch (e) {
			console.log(e);
		}
	}

	const {
		wins,
		losses,
		totalProfit,
		winRate,
		profitFactor,
		rw,
		rl,
		maxContinueWin,
		maxContinueLoss,
		maxWinCount,
		maxLossCount,
	} = backtester.calcTrades(totalTrades);

	const carry = carryForluma(Number(winRate) / 100, rl, rw);

	console.log(`
	  ========== 回测结果 ==========
	  总交易次数:     ${totalTrades.length}
    盈利次数:       ${wins.length}
    亏损次数:       ${losses.length}
	  胜率:          ${winRate}%
	  总收益:        ${totalProfit.toFixed(2)} USDT
	  盈亏比:        ${profitFactor.toFixed(2)}
    rw:        ${rw.toFixed(4)}
    rl:        ${rl.toFixed(4)}
    carry:        ${carry.toFixed(2)}
    最大连续盈利:  ${maxContinueWin}
    最大连续亏损:  ${maxContinueLoss}
    最大连盈次数:  ${maxWinCount}
    最大连亏次数:  ${maxLossCount}
	  =============================
	`);

	console.log('tradeNumTotal', tradeNumTotal);
	console.log('profitTotal', profitTotal);
	console.log('maxLossTotal', maxLossTotal);
	console.log('winRateTotal', winRateTotal);
	console.log('period month', loop - 1);
	console.log('avgRate', (winRateTotal / (loop - 1)).toFixed(2));
	console.log('maxDrawdownTotal', maxDrawdownTotal);

	formatProfitMap(profitMapTotal);
})();

function formatProfitMap(profitMap) {
	const list = Object.entries(profitMap).map(([key, value]) => {
		// console.log(`
		// ========== 交易类型: ${key} ==========
		// 总交易次数:     ${value.length}`);
		const typeProfit = value.reduce((sum, t) => sum + t, 0);
		const typeWin = value
			.filter((t) => t > 0)
			.reduce((sum, t) => sum + t, 0);
		const typeLoss = value
			.filter((t) => t <= 0)
			.reduce((sum, t) => sum + t, 0);
		const typeWinNum = value.filter((t) => t > 0).length;
		const typeLossNum = value.filter((t) => t <= 0).length;
		const typeWinRate = ((typeWinNum / value.length) * 100 || 0).toFixed(2);
		const typeMax = Math.max(...value);
		const typeMin = Math.min(...value);
		const typeAvgWin = typeProfit / value.length;
		const typeA = (Number(typeAvgWin) * Number(typeWinRate)) / 100;

		return {
			key,
			typeProfit,
			typeNum: value.length,
			typeWin,
			typeLoss,
			typeWinRate,
			typeWinNum,
			typeLossNum,
			typeMax,
			typeMin,
			typeAvgWin,
			typeA,
		};
	});

	// list.sort((a, b) => b.typeA - a.typeA);
	list.sort((a, b) => b.typeA - a.typeA);
	list.forEach((item) => {
		console.log(
			item.key,
			'总交易次数:',
			item.typeNum,
			'盈利:',
			item.typeWin,
			'亏损:',
			item.typeLoss,
			'最大盈利:',
			item.typeMax.toFixed(2),
			'最大亏损:',
			item.typeMin.toFixed(2),
			'总收益:',
			item.typeProfit.toFixed(2),
			'平均盈利:',
			item.typeAvgWin.toFixed(2),
			'typeA:',
			item.typeA.toFixed(2),
			'胜率:',
			item.typeWinRate + '%'
		);
	});
}

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
