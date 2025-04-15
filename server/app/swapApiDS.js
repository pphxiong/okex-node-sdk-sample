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
const WebSocket = require('ws');
const fs = require('fs');
require('dotenv').config();

// const MAX_TRADE_POSITION_RATIO = 7 / 10;
// const LEVERAGE = 20;

// 配置参数
const config = {
	symbol: 'DOGE/USDT',
	// timeframe: '1m',
	timeframes: ['15m' /*  '5m''1m'*/], // 多周期参数
	emaSettings: {
		// '30m': { periods: [10, 5], slopeWindow: 5 },
		'15m': { periods: [25, 5], slopeWindow: 5 },
		// '5m': { periods: [25, 5], slopeWindow: 5 },
	},
	macdParams: { '15m': [12, 26, 9] },
	slowframe: '15m',
	fastframe: '15m',
	// 布林线参数
	bollinger: {
		period: 20,
		stdDev: 1.8,
	},
	orderDepth: 0.00012, // 限价单挂单深度 (0.1%)
	tradeAmount: 750, // 每单交易金额(USDT)
	maxOrderAge: 1000 * 60, // 限价单最长存活时间(30秒)
	trailingStop: 0.0025, // 浮动止盈止损(0.25%)
	stopLoss: 0.01, // 硬止损(0.5%)
	coolingPeriod: 120, // 基础冷却时间(秒)
	numSegments: 5, // 分段数量
	icebergRatio: 0.2, // 冰山可见部分比例
	// BOLL参数
	bollPeriod: 14,
	bollStdDev: 3.0,
	// MACD参数
	macdFast: 8,
	macdSlow: 17,
	macdSignal: 5,
	coldStartBars: 300, // 冷启动期间的K线数量
	atrParam: {
		// ATR参数
		atrPeriod: 14,
		stopLoss: 1.6,
		takeProfit: 6.4,
	},
	riskPerTrade: 0.02, // 每笔交易风险2%
	leverage: 20, // 杠杆倍数
	adxPeriod: 14,
	rsiPeriod: 14,
	// EMA斜率参数
	emaSlope: {
		period: 10,
		lookback: 5, // 计算5根K线斜率
		emaSlopeThreshold: 0.005 * 0.01, // EMA斜率阈值
		// emaSlopeThreshold: 0, // EMA斜率阈值
	},
};

const initState = {
	activeOrders: [], // 活跃限价单
	position: 0, // 当前持仓数量
	entryPrice: 0, // 持仓均价
	highestPrice: 0, // 持仓期间最高价
	lowestPrice: Infinity, // 持仓期间最低价
	side: 'buy', // 交易方向
	coolingUntil: 0, // 基础冷却结束时间
};

// 全局状态
let state = JSON.parse(JSON.stringify(initState));
let marketData = {
	[config.slowframe]: [],
	[config.fastframe]: [],
};
let ws = null;
let availableBalance = 0;
let RESTART_TIME = 0;

// 初始化交易所
const exchange = new ccxt.binance({
	apiKey: configBN.httpkey,
	secret: configBN.httpsecret,
	options: {
		adjustForTimeDifference: true,
		defaultType: 'future',
		hedgeMode: true,
	},
});

function getMarketType(candle, lastCandle) {
	let marketType = '不确定';
	if (!lastCandle) return marketType;

	const {
		adx,
		adxPlusDI,
		adxMinusDI,
		rsi,
		close,
		open,
		emaSlope,
		emaFast,
		emaSlow,
	} = candle;
	const {
		adx: lastAdx,
		adxPlusDI: lastAdxPlusDI,
		rsi: lastRSI,
		emaSlope: lastEmaslope,
		emaFast: lastEmaFast,
		emaSlow: lastEmaSlow,
		close: lastClose,
	} = lastCandle;
	// if (!lastAdx) return marketType;

	const stronger = emaFast > emaSlow;
	const weeker = emaFast < emaSlow;

	const lastStronger = lastEmaFast > lastEmaSlow;
	const lastWeeker = lastEmaFast < lastEmaSlow;

	if (emaFast > emaSlow) {
		if (close > emaFast) {
			if (adxPlusDI > adxMinusDI) {
				if (rsi > 70) {
					marketType = adxMinusDI > 15 ? '趋势空' : '趋势多';
					if (
						adxMinusDI > 15 &&
						rsi > 75 &&
						emaSlope > config.emaSlope.emaSlopeThreshold * 2 &&
						adx >= 30
					)
						marketType = '趋势空且增强';
				} else if (
					rsi < 60 &&
					emaSlope > config.emaSlope.emaSlopeThreshold / 2
				) {
					marketType = '趋势多且增强';
				}
			} else {
				if (adx < 20 && adx > 15) {
					if (rsi > 60) marketType = '趋势空且增强';
					if (rsi < 45) marketType = '趋势多且增强';
				}
			}
		} else if (close < emaSlow) {
			if (adxPlusDI < adxMinusDI) {
				if (rsi < 50) marketType = '趋势空且增强';
			}
			if (adxPlusDI > adxMinusDI) {
				if (rsi > 50) marketType = '趋势多且增强';
			}

			if (adx >= 25 && rsi > 40) marketType = '趋势多且增强';
			if (adx < 15)
				marketType = adxPlusDI > adxMinusDI ? '趋势多' : '趋势空';
			if (adx < 25) {
				marketType = rsi < 40 ? '趋势空' : '趋势多';
			}
			if (adx < 20 && rsi > 55 && adxPlusDI > adxMinusDI) {
				marketType = '趋势多且增强';
			}
			if (adx < 20 && rsi < 45 && adxPlusDI < adxMinusDI) {
				marketType = '趋势空且增强';
			}
		} else {
			if (adx < 25 && adx > 20) {
				if (rsi > 50) marketType = '趋势多且增强';
				if (rsi < 50) marketType = '趋势空且增强';
			}
		}
	}

	if (emaFast < emaSlow) {
		if (close < emaFast) {
			if (adxPlusDI < adxMinusDI) {
				if (rsi < 30) {
					marketType = '趋势多';
					if (
						rsi < 25 &&
						emaSlope < -config.emaSlope.emaSlopeThreshold * 2 &&
						adx >= 30
					)
						marketType = '趋势多且增强';
				} else if (
					rsi > 40 &&
					emaSlope < -config.emaSlope.emaSlopeThreshold / 2
				) {
					marketType = '趋势空且增强';
				}
			} else {
				if (adx < 20 && adx > 15) {
					if (rsi > 60) marketType = '趋势空且增强';
					if (
						rsi < 45 &&
						emaSlope < -config.emaSlope.emaSlopeThreshold
					)
						marketType = '趋势多且增强';
				}
			}
		} else if (close > emaSlow) {
			marketType = '趋势空';

			if (adx < 15)
				marketType = adxPlusDI > adxMinusDI ? '趋势空' : '趋势多';
			if (adx < 20 && rsi > 55 && adxPlusDI > adxMinusDI) {
				marketType = '趋势多且增强';
			}
			if (adx < 20 && rsi < 45 && adxPlusDI < adxMinusDI) {
				marketType = '趋势空且增强';
			}
		} else {
		}
	}

	if (adxPlusDI > adxMinusDI && emaFast < emaSlow && close < emaFast) {
		if (rsi < 30 && emaSlope < -config.emaSlope.emaSlopeThreshold)
			marketType = '趋势空';
	}
	if (adxPlusDI < adxMinusDI && emaFast > emaSlow && close > emaFast) {
		if (rsi > 70 && emaSlope > config.emaSlope.emaSlopeThreshold)
			marketType = '趋势多';
	}

	return marketType;
}

function findSwingPoints(candles) {
	const swingPoints = { highs: [], lows: [] };

	for (let i = 2; i < candles.length - 2; i++) {
		const window = candles.slice(i - 2, i + 3);
		const center = window[2];

		if (
			center.high ===
			Math.max.apply(
				null,
				window.map((w) => w.high)
			)
		) {
			swingPoints.highs.push({
				index: i,
				price: center.high,
				timestamp: center.timestamp,
			});
		}

		if (
			center.low ===
			Math.min.apply(
				null,
				window.map((w) => w.low)
			)
		) {
			swingPoints.lows.push({
				index: i,
				price: center.low,
				timestamp: center.timestamp,
			});
		}
	}

	return swingPoints;
}

async function calculateAdx(highs, lows, closes) {
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

// 计算技术指标
async function calculateIndicators() {
	try {
		const indicatorPromises = [];

		config.timeframes.forEach(async (tf) => {
			// 计算布林带
			const closes = marketData[tf].map((d) => d.close);
			const highs = marketData[tf].map((d) => d.high);
			const lows = marketData[tf].map((d) => d.low);

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

			indicatorPromises.push(calculateAdx(highs, lows, closes));

			indicatorPromises.push(
				tulind.indicators.rsi.indicator([closes], [config.rsiPeriod])
			);
		});

		const result = await Promise.all(indicatorPromises);

		// 合并指标到数据
		config.timeframes.forEach((tf, index) => {
			const [
				emaSlow,
				emaFast,
				bollinger,
				atr,
				[adx, adxPlusDI, adxMinusDI],
				rsi,
			] = result.slice(index * 6, (index + 1) * 6);
			// 计算EMA斜率
			const emaSlopes = [];
			for (
				let i = config.emaSettings[tf].slopeWindow;
				i < emaSlow[0].length;
				i++
			) {
				const slope =
					(emaSlow[0][i] -
						emaSlow[0][i - config.emaSettings[tf].slopeWindow]) /
					config.emaSettings[tf].slopeWindow;
				emaSlopes.push(slope);
			}

			// 合并指标到数据
			marketData[tf].forEach((d, i) => {
				if (i >= config.bollinger.period) {
					const bbIndex = i - config.bollinger.period + 1;
					d.upper = bollinger[0][bbIndex];
					d.middle = bollinger[1][bbIndex];
					d.lower = bollinger[2][bbIndex];
				}
				if (i >= config.emaSettings[tf].slopeWindow) {
					const slopeIndex = i - config.emaSettings[tf].slopeWindow;
					d.emaSlope = emaSlopes[slopeIndex];
				}
				if (i >= config.atrParam.atrPeriod) {
					const atrIndex = i - config.atrParam.atrPeriod + 1;
					d.atr = atr[0][atrIndex];
				}
				if (i >= config.adxPeriod) {
					const adxIndex = i - config.adxPeriod * 2 + 2;
					d.adx = adx[adxIndex];
					d.adxPlusDI = adxPlusDI ? adxPlusDI[adxIndex] : null;
					d.adxMinusDI = adxMinusDI ? adxMinusDI[adxIndex] : null;
				}
				if (i >= config.rsiPeriod) {
					const rsiIndex = i - config.rsiPeriod;
					d.rsi = rsi[0][rsiIndex];
				}
				d.emaSlow = emaSlow[0][i];
				d.emaFast = emaFast[0][i];
				d.marketType = getMarketType(d, marketData[tf][i - 1]);
			});
		});
	} catch (e) {
		console.error('指标计算错误:', e);
	}
}

function parseKLine(data) {
	return {
		timestamp: data[0],
		open: parseFloat(data[1]),
		high: parseFloat(data[2]),
		low: parseFloat(data[3]),
		close: parseFloat(data[4]),
		volume: parseFloat(data[5]),
	};
}

// 获取订单簿深度
async function getOrderBook() {
	const ob = await exchange.fetchOrderBook(config.symbol);
	return {
		bid: ob.bids[0][0], // 最佳买价
		ask: ob.asks[0][0], // 最佳卖价
		spread: ob.asks[0][0] - ob.bids[0][0],
	};
}

function getLastIndicators(indicators, key) {
	return indicators[key][indicators[key].length - 1];
}

function getPositionSize(atr) {
	const riskAmount = config.tradeAmount * config.riskPerTrade;
	// return riskAmount / (atr * config.leverage);
	return config.tradeAmount;
}

// 限价单管理模块
class OrderManager {
	static async createLimitOrder(side, amount, price, isOpen = true, singal) {
		// const positionSize = isOpen ? getPositionSize() : amount;
		const positionSize = amount;
		const positionSide = isOpen
			? side === 'buy'
				? 'LONG'
				: 'SHORT'
			: side === 'buy'
			? 'SHORT'
			: 'LONG';
		const order = await exchange.createLimitOrder(
			config.symbol,
			side,
			positionSize,
			price,
			{
				positionSide,
			}
		);
		const { fastMarketType, slowMarketType } = singal;
		state.activeOrders.push({
			id: order.id,
			side,
			positionSize,
			price,
			fastMarketType,
			slowMarketType,
			timestamp: Date.now(),
		});
		return order;
	}

	static async createMarketOrder(side, amount, price) {
		const order = await exchange.createOrder(
			config.symbol,
			'market',
			side,
			amount,
			null,
			{
				positionSide: side === 'buy' ? 'LONG' : 'SHORT',
			}
		);
		state.activeOrders.push({
			id: order.id,
			side,
			amount,
			price: order.price,
			timestamp: Date.now(),
		});
		return order;
	}

	static async cancelOrder(orderId) {
		await exchange.cancelOrder(orderId, config.symbol);
		state.activeOrders = state.activeOrders.filter((o) => o.id !== orderId);
	}

	static async checkOrderStatus(currentPrice) {
		// if (Math.abs(state.position) >= config.tradeAmount / currentPrice) {
		//   for (const order of [...state.activeOrders]) {
		//     await this.cancelOrder(order.id);
		//   }
		//   state.activeOrders = [];
		//   return;
		// }

		for (const order of [...state.activeOrders]) {
			// 检查订单状态
			const status = await exchange.fetchOrder(order.id, config.symbol);

			// 处理超时订单
			if (
				Date.now() - order.timestamp > config.maxOrderAge &&
				status.remaining > 0
			) {
				console.log(`订单超时取消: ${order.id}`);
				await this.cancelOrder(order.id);
			}

			if (status.filled > 0) {
				console.log(
					`订单部分成交: ${status.id} ${status.filled}/${status.amount}`
				);
				console.log(status);

				// 更新持仓
				if (
					!state.position ||
					Math.abs(state.position) < Math.abs(status.amount)
				) {
					state.position = 0;
					state.entryPrice = 0;
					state.highestPrice = 0;
					const filledValue = status.filled * status.price;
					state.position +=
						status.side === 'buy' ? status.filled : -status.filled;
					state.entryPrice =
						(state.entryPrice * state.position + filledValue) /
						state.position;
					state.side = status.side;
					state.fastMarketType = order.fastMarketType;
					state.slowMarketType = order.slowMarketType;
				} else {
					state.position = 0;
					state.entryPrice = 0;
					state.highestPrice = 0;
					state.lowestPrice = 0;
				}

				// 移除完全成交订单
				if (status.remaining <= 0) {
					state.activeOrders = state.activeOrders.filter(
						(o) => o.id !== status.id
					);
				}

				this.writeData();
			}
		}
	}

	static async writeData() {
		let jsonStr = JSON.stringify(
			Object.assign(state, {
				writeMoment: moment().format('YYYY-MM-DD HH:mm:ss'),
			})
		);

		const result = await new Promise((resolve) => {
			//将修改后的内容写入文件
			fs.writeFile('./app/config.json', jsonStr, function (err) {
				if (err) {
					console.error(err);
				} else {
					console.log('----------文件修改成功-------------');
					console.log(jsonStr);
					resolve(true);
				}
			});
		});

		return result;
	}

	// 执行分段冰山订单
	static async executeSegmentedIcebergOrder() {
		const { side } = state;
		const {
			symbol,
			tradeAmount: totalAmount,
			numSegments,
			icebergRatio,
		} = config;
		const segmentAmount = totalAmount / numSegments;

		for (let i = 0; i < numSegments; i++) {
			try {
				// 获取最新价格
				const ticker = await exchange.fetchTicker(symbol);
				const price = ticker.last;

				// 计算冰山订单参数
				const visibleAmount = segmentAmount * icebergRatio;
				const icebergQty = visibleAmount.toFixed(6);

				// 创建冰山订单
				const order = await exchange.createOrder(
					symbol,
					'limit',
					side,
					segmentAmount,
					price,
					{
						icebergQty: icebergQty,
						timeInForce: 'GTC',
						positionSide: side === 'buy' ? 'LONG' : 'SHORT',
					}
				);

				console.log(
					`第 ${i + 1}/${numSegments} 段订单已执行:`,
					order.id
				);

				// 等待间隔（避免触发风控）
				await new Promise((resolve) => setTimeout(resolve, 3 * 1000));
			} catch (error) {
				console.error('订单创建失败:', error.message);
				break;
			}
		}
	}
}

function getHighsAndLows(indicators) {
	const lastHighs = indicators.swingPoints.highs
		.map((i) =>
			Object.assign(i, {
				timestamp: moment(i.timestamp).format('YYYY-MM-DD HH:mm:ss'),
			})
		)
		.slice(-2);
	const lastLows = indicators.swingPoints.lows
		.map((i) =>
			Object.assign(i, {
				timestamp: moment(i.timestamp).format('YYYY-MM-DD HH:mm:ss'),
			})
		)
		.slice(-2);

	const highest = Math.max.apply(
		null,
		lastHighs.map((h) => h.price)
	);
	const lowest = Math.min.apply(
		null,
		lastLows.map((h) => h.price)
	);
	const highLower = Math.min.apply(
		null,
		lastHighs.map((h) => h.price)
	);
	const lowHigher = Math.max.apply(
		null,
		lastLows.map((h) => h.price)
	);
	return { lastHighs, lastLows, highest, lowest, highLower, lowHigher };
}

function getTimeStampBefore(dataList, timestamp) {
	dataList = JSON.parse(JSON.stringify(dataList));
	let data;
	let i = 0;
	const period = config.fastframe.split('m')[0];

	while (true) {
		const time = moment(timestamp).subtract(Number(period) * i, 'minutes');
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

function getTimeStampSlowBefore(dataList, timestamp) {
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

// 交易信号生成
async function generateSignal(currentPrice, isShowLog = false) {
	const lastKline5M = JSON.parse(
		JSON.stringify(marketData[config.fastframe].slice(-1)[0])
	);
	const secondKline5M = JSON.parse(
		JSON.stringify(marketData[config.fastframe].slice(-2)[0])
	);
	const candle = {
		// [config.slowframe]: getTimeStampBefore(
		// 	marketData[config.slowframe],
		// 	lastKline5M.timestamp
		// ),
		[config.fastframe]: lastKline5M,
	};

	const { marketType: fastMarketType } = candle[config.fastframe];
	const { marketType: slowMarketType } = candle[config.slowframe];

	const longConditions = [
		slowMarketType === '趋势多且增强',
		slowMarketType === '趋势潜在增强',
		slowMarketType === '震荡市开多',
		slowMarketType === '潜在转折多',
	];
	const shortConditions = [
		slowMarketType === '趋势空且增强',
		slowMarketType === '趋势潜在减弱',
		slowMarketType === '震荡市开空',
		slowMarketType === '潜在转折空',
	];

	const longCondition = longConditions.some((condition) => !!condition);
	const shortCondition = shortConditions.some((condition) => !!condition);

	if (isShowLog) {
		console.log('################################');
		console.log('time', moment().format('YYYY-MM-DD HH:mm:ss'));
		console.log('currentPrice', currentPrice);
		console.log('entryPrice', state.entryPrice);
		console.log('position', state.position);
		console.log('side', state.side);
		console.log('longCondition', longCondition);
		console.log('shortCondition', shortCondition);
		// console.log(
		// 	config.fastframe,
		// 	Object.assign(candle[config.fastframe], {
		// 		timestamp: moment(candle[config.fastframe].timestamp).format(
		// 			'YYYY-MM-DD HH:mm:ss'
		// 		),
		// 	})
		// );
		console.log(
			config.slowframe,
			Object.assign(candle[config.slowframe], {
				timestamp: moment(candle[config.slowframe].timestamp).format(
					'YYYY-MM-DD HH:mm:ss'
				),
			})
		);
		// console.log(marketData[config.slowframe].slice(-3));
		console.log('################################');
	}

	return {
		buySignal: longCondition,
		sellSignal: shortCondition,
		price: currentPrice,
		kline: lastKline5M,
		fastMarketType,
		slowMarketType,
	};
}

// 风险管理模块
class RiskManager {
	static checkStopConditions(signal) {
		if (state.position === 0) return false;

		const lastKline5M = JSON.parse(
			JSON.stringify(marketData[config.fastframe].slice(-1)[0])
		);
		const candle = {
			// [config.slowframe]: getTimeStampBefore(
			//   marketData[config.slowframe],
			//   lastKline5M.timestamp
			// ),
			[config.fastframe]: lastKline5M,
		};

		const { marketType: fastMarketType } = candle[config.fastframe];
		const { marketType: slowMarketType } = candle[config.slowframe];

		const { price: currentPrice } = signal;
		const { side, position } = state;
		let isStop = false;

		// const takeProfit =
		//   lastKline5M[config.fastframe].atr * config.atrParam.takeProfit;
		// const stopLoss =
		//   lastKline5M[config.fastframe].atr * config.atrParam.stopLoss;

		// const isProfitTarget =
		//   side === "buy"
		//     ? lastKline5M[config.fastframe].close >=
		//       position.entryPrice + takeProfit
		//     : lastKline5M[config.fastframe].close <=
		//       position.entryPrice - takeProfit;

		isStop =
			side === 'buy'
				? [
						'趋势多且增强',
						// '趋势潜在增强',
						// '震荡市开多',
						// '潜在转折多',
				  ].includes(state.slowMarketType) &&
				  [
						'超买市',
						'趋势空且增强',
						'潜在转折空',
						'震荡市开空',
						'趋势潜在减弱',
						'趋势多且减弱',
						'趋势多只平不开',
						'趋势空',
				  ].includes(slowMarketType)
				: [
						'趋势空且增强',
						// '趋势潜在减弱',
						// '震荡市开空',
						// '潜在转折空',
				  ].includes(state.slowMarketType) &&
				  [
						'超卖市',
						'趋势多且增强',
						'潜在转折多',
						'震荡市开多',
						'趋势潜在增强',
						'趋势空且减弱',
						'趋势空只平不开',
						'趋势多',
				  ].includes(slowMarketType);

		// console.log('***********************************');
		// console.log('entryPrice', state.entryPrice);
		// console.log('currentPrice', currentPrice);
		// console.log('isStop', isStop);
		// console.log('***********************************');
		return isStop;
	}

	static async closePosition(singal, orderBook) {
		const { price: currentPrice } = singal;
		const side = state.position > 0 ? 'sell' : 'buy';
		const amount = Math.abs(state.position);

		console.log('time', moment().format('YYYY-MM-DD HH:mm:ss'));
		console.log(
			`%c强制平仓 | 方向:${side} 数量:${amount} 均价:${state.entryPrice} 当前价:${currentPrice}`,
			'color: red; font-weight: bold;'
		);

		if (side === 'buy') {
			const limitPrice = orderBook.bid * (1 - config.orderDepth);
			await OrderManager.createLimitOrder(
				'buy',
				amount,
				limitPrice,
				false,
				singal
			);
		}

		if (side === 'sell') {
			const limitPrice = orderBook.ask * (1 + config.orderDepth);
			await OrderManager.createLimitOrder(
				'sell',
				amount,
				limitPrice,
				false,
				singal
			);
		}

		// await exchange.createOrder(
		// 	config.symbol,
		// 	'market',
		// 	side,
		// 	amount,
		// 	null,
		// 	{
		// 		positionSide: side === 'sell' ? 'LONG' : 'SHORT',
		// 	}
		// );

		// 重置状态
		// state.position = 0;
		// state.entryPrice = 0;
		// state.highestPrice = 0;
		// state.lowestPrice = 0;

		// this.activateCooldown();
	}

	static activateCooldown() {
		const base = config.coolingPeriod;
		// const lossFactor = this.state.dailyMetrics.winRate < 0.5 ? 1.5 : 1;
		const lossFactor = 1;
		const cooldown = base * lossFactor * 1000;

		state.coolingUntil = Date.now() + cooldown;
		console.log(`交易冷却激活，持续时间：${cooldown / 1000}秒`);
	}

	static isCoolingDown() {
		return Date.now() < state.coolingUntil;
	}
}

// 初始化历史数据
async function initialize() {
	console.log('正在获取历史数据...');
	const candlePromises = [];
	config.timeframes.forEach((timeframe) => {
		candlePromises.push(
			exchange.fetchOHLCV(
				config.symbol,
				timeframe,
				undefined,
				config.coldStartBars
			)
		);
	});

	const [candlesFast] = await Promise.all(candlePromises);

	// candlesSlow.pop();
	// candlesMedium.pop();
	candlesFast.pop();

	// marketData[config.slowframe] = candlesSlow.map(parseKLine);
	marketData[config.fastframe] = candlesFast.map(parseKLine);

	mergeTimeframes();

	// console.log(
	// 	`已加载${config.slowframe} ${
	// 		marketData[config.slowframe].length
	// 	}根历史K线`
	// );
	console.log(
		`已加载${config.fastframe} ${
			marketData[config.fastframe].length
		}根历史K线`
	);
}

// 策略主逻辑
async function strategyLoop(isShowLog = false) {
	try {
		// const currentPrice = candles[candles.length - 1][4];
		const ticker = await exchange.fetchTicker(config.symbol);
		const currentPrice = ticker.last;

		// 步骤1: 清理过期订单
		await OrderManager.checkOrderStatus(currentPrice);

		await calculateIndicators();

		// 步骤2: 获取信号
		const signal = await generateSignal(currentPrice, isShowLog);
		const orderBook = await getOrderBook();

		// 步骤3: 检查强制平仓
		if (RiskManager.checkStopConditions(signal)) {
			await RiskManager.closePosition(signal, orderBook);
			return;
		}

		// 步骤4: 生成限价单
		if (state.position === 0 && !RiskManager.isCoolingDown()) {
			const { kline } = signal;
			if (
				signal.buySignal /* && orderBook.spread < orderBook.ask * 0.001 */
			) {
				const limitPrice = orderBook.bid * (1 - config.orderDepth);
				const amount = config.tradeAmount / limitPrice;

				state = JSON.parse(JSON.stringify(initState));

				await OrderManager.createLimitOrder(
					'buy',
					amount,
					limitPrice,
					true,
					signal
					// kline.atr
				);
				console.log('time', moment().format('YYYY-MM-DD HH:mm:ss'));
				console.log(
					`%c挂买单 | 价格:${limitPrice} 数量:${amount}`,
					'color: red; font-weight: bold;'
				);
			}

			if (
				signal.sellSignal /* && orderBook.spread < orderBook.bid * 0.001 */
			) {
				const limitPrice = orderBook.ask * (1 + config.orderDepth);
				const amount = config.tradeAmount / limitPrice;

				state = JSON.parse(JSON.stringify(initState));

				await OrderManager.createLimitOrder(
					'sell',
					amount,
					limitPrice,
					true,
					signal
					// kline.atr
				);
				console.log('time', moment().format('YYYY-MM-DD HH:mm:ss'));
				console.log(
					`%c挂卖单 | 价格:${limitPrice} 数量:${amount}`,
					'color: red; font-weight: bold;'
				);
			}
		}
	} catch (err) {
		console.log('time', moment().format('YYYY-MM-DD HH:mm:ss'));
		console.error('策略错误:', err.message);
		restart(err.message);
	}
}

const readData = async () => {
	let dataConfig = JSON.parse(fs.readFileSync('./app/config.json', 'utf-8'));

	const { position, entryPrice } = dataConfig;
	dataConfig = Object.assign(dataConfig, {
		position: Number(position),
		entryPrice: Number(entryPrice),
	});

	console.log('read::', dataConfig, moment().format('YYYY-MM-DD HH:mm:ss'));
	return dataConfig;
};

async function initPositionData() {
	const positionResult = await cAuthClientBN.swap.getPosition();
	const { positions, availableBalance } = positionResult;
	if (positions) {
		const holding = positions.find(
			(item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
		);
		if (holding) {
			const dataConfig = await readData();
			state = {
				activeOrders: [], // 活跃限价单
				position: Number(holding.positionAmt), // 当前持仓数量
				entryPrice: Number(holding.entryPrice), // 持仓均价
				highestPrice: Number(holding.entryPrice), // 持仓期间最高价
				lowestPrice: Number(holding.entryPrice), // 持仓期间最低价
				side: holding.positionSide === 'LONG' ? 'buy' : 'sell',
			};
			delete dataConfig.position;
			state = Object.assign(state, dataConfig);
		}
	}
	return availableBalance;
}

// 实时数据订阅
function connectWebSocket() {
	const symbolForWS = config.symbol.replace('/', '').toLowerCase();
	const streams = [
		`${symbolForWS}@kline_${config.slowframe}`,
		`${symbolForWS}@kline_${config.fastframe}`,
	];
	// ws = new WebSocket(
	//   "wss://fstream.binance.com/ws/" + symbolForWS + "@kline_1m"
	// );
	ws = new WebSocket(
		`wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`
	);

	ws.on('open', () => {
		console.log('WebSocket连接已建立');
	});

	ws.on('message', async (data) => {
		const msg = JSON.parse(data);
		if (msg.stream && msg.data) {
			const streamInfo = msg.stream.split('@');
			const [symbol, period] = streamInfo;
			const periodMap = {
				[`kline_${config.slowframe}`]: config.slowframe,
				[`kline_${config.fastframe}`]: config.fastframe,
			};

			if (!msg.data.k.x) return; // 仅处理闭合K线
			console.log('-----------------收到消息-----------------------');
			console.log(`更新: ${symbol} ${periodMap[period]} K线`);
			await OrderManager.checkOrderStatus();
			restart('kline update');
			// await handleKlineUpdate(msg.data, periodMap[period]);
			// await strategyLoop();
			//   console.log("-----------------------------------");
		}
	});

	ws.on('error', (err) => {
		console.error('WebSocket错误:', err);
	});
}

// 处理K线更新
async function handleKlineUpdate(msg, tf) {
	const kline = msg.k;
	if (!kline.x) return; // 仅处理闭合K线

	// 更新OHLCV数据
	const newBar = [
		kline.t, // 时间戳
		kline.o, // 开盘价
		kline.h, // 最高价
		kline.l, // 最低价
		kline.c, // 收盘价
		kline.v, // 成交量
	];

	// 维护固定长度的数据窗口
	if (marketData[tf].length >= config.coldStartBars) {
		marketData[tf].shift();
	}
	marketData[tf].push(parseKLine(newBar));
	mergeTimeframes();
}

// 多周期时间戳对齐
function mergeTimeframes() {
	const baseTimestamps = marketData[config.fastframe].map((c) => c.timestamp);

	config.timeframes.forEach((tf) => {
		if (tf === config.fastframe) return;
		marketData[tf] = marketData[tf].filter((c) =>
			baseTimestamps.includes(c.timestamp)
		);
	});
}

// 启动策略
(async () => {
	await exchange.loadMarkets();
	await initialize();
	availableBalance = await initPositionData();
	connectWebSocket();
	await strategyLoop(true);
	setInterval(async () => {
		await strategyLoop(false);
		// RESTART_TIME += 1;
		// if (RESTART_TIME >= 3) {
		// 	RESTART_TIME = 0;
		// 	restart('normal');
		// 	return;
		// }
	}, 1000 * 60 * 3);
	console.log('策略已启动...');
})();

app.listen(8093);

console.log('8093 server start');

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
