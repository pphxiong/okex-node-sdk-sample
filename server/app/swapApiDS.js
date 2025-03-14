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

let RESTART_TIME = 0;

const ccxt = require('ccxt');
const tulind = require('tulind');
const WebSocket = require('ws');
require('dotenv').config();

// 配置参数
const config = {
	symbol: 'DOGE/USDT',
	timeframe: '1m',
	emaPeriods: [5, 20, 55], // 三EMA周期
	orderDepth: 0.001 / 2, // 限价单挂单深度 (0.1%)
	tradeAmount: 1000, // 每单交易金额(USDT)
	maxOrderAge: 10000, // 限价单最长存活时间(30秒)
	trailingStop: 0.0025, // 浮动止盈止损(0.25%)
	stopLoss: 0.008, // 硬止损(0.5%)
	takeProfit: 0.012, // 硬止盈(1%)
	coolingPeriod: 180, // 基础冷却时间(秒)
	numSegments: 5, // 分段数量
	icebergRatio: 0.2, // 冰山可见部分比例
	// BOLL参数
	bollPeriod: 14,
	bollStdDev: 3.0,
	// MACD参数
	macdFast: 8,
	macdSlow: 17,
	macdSignal: 5,
	coldStartBars: 100, // 冷启动期间的K线数量
};

// 全局状态
let state = {
	activeOrders: [], // 活跃限价单
	position: 0, // 当前持仓数量
	entryPrice: 0, // 持仓均价
	highestPrice: 0, // 持仓期间最高价
	lowestPrice: Infinity, // 持仓期间最低价
	side: 'buy', // 交易方向
	coolingUntil: 0, // 基础冷却结束时间
};
let ohlcv = [];
let ws = null;
let dailyPnL = 0;

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

// 计算技术指标
async function calculateIndicators() {
	const closes = ohlcv.map((t) => t[4]);

	// 并行计算指标
	const [boll, macd] = await Promise.all([
		tulind.indicators.bbands.indicator(
			[closes],
			[config.bollPeriod, config.bollStdDev]
		),
		tulind.indicators.macd.indicator(
			[closes],
			[config.macdFast, config.macdSlow, config.macdSignal]
		),
	]);

	return {
		lower: boll[0],
		middle: boll[1],
		upper: boll[2],
		macdLine: macd[0],
		signalLine: macd[1],
		histogram: macd[2],
	};
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

// EMA计算函数
async function calculateEMA(candles, period) {
	const formatCandles = candles.map(parseKLine);
	const closes = formatCandles.map((c) => c.close);
	return new Promise((resolve) => {
		tulind.indicators.ema.indicator([closes], [period], (err, results) => {
			resolve(results[0]);
		});
	});
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

// 限价单管理模块
class OrderManager {
	static async createLimitOrder(side, amount, price) {
		const order = await exchange.createLimitOrder(
			config.symbol,
			side,
			amount,
			price,
			{
				positionSide: side === 'buy' ? 'LONG' : 'SHORT',
			}
		);
		state.activeOrders.push({
			id: order.id,
			side,
			amount,
			price,
			timestamp: Date.now(),
		});
		return order;
	}

	static async cancelOrder(orderId) {
		await exchange.cancelOrder(orderId, config.symbol);
		state.activeOrders = state.activeOrders.filter((o) => o.id !== orderId);
	}

	static async checkOrderStatus(currentPrice) {
		if (Math.abs(state.position) >= config.tradeAmount / currentPrice) {
			for (const order of [...state.activeOrders]) {
				await this.cancelOrder(order.id);
			}
			state.activeOrders = [];
			return;
		}

		for (const order of [...state.activeOrders]) {
			// 处理超时订单
			if (Date.now() - order.timestamp > config.maxOrderAge) {
				await this.cancelOrder(order.id);
				console.log(`订单超时取消: ${order.id}`);
			}

			// 检查订单状态
			const status = await exchange.fetchOrder(order.id, config.symbol);

			if (status.filled > 0) {
				console.log(
					`订单部分成交: ${status.id} ${status.filled}/${status.amount}`
				);

				// 更新持仓
				const filledValue = status.filled * status.price;
				state.position +=
					status.side === 'buy' ? status.filled : -status.filled;
				state.entryPrice =
					(state.entryPrice * state.position + filledValue) /
					(state.position + status.filled);
				state.side = status.side;

				// 移除完全成交订单
				if (status.remaining <= 0) {
					state.activeOrders = state.activeOrders.filter(
						(o) => o.id !== status.id
					);
				}
			}
		}
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

// 交易信号生成
async function generateSignal(candles, currentPrice) {
	// const [ema9, ema21, ema55] = await Promise.all([
	// 	calculateEMA(candles, config.emaPeriods[0]),
	// 	calculateEMA(candles, config.emaPeriods[1]),
	// 	calculateEMA(candles, config.emaPeriods[2]),
	// ]);

	// const ema9Last = ema9[ema9.length - 2];
	// const ema21Last = ema21[ema21.length - 2];
	// const ema9Current = ema9[ema9.length - 1];
	// const ema21Current = ema21[ema21.length - 1];
	// const ema55Current = ema55[ema55.length - 1];

	const indicators = await calculateIndicators();

	// 当前指标值
	const price = ohlcv[ohlcv.length - 1][4];
	const upper = getLastIndicators(indicators, 'upper');
	const lower = getLastIndicators(indicators, 'lower');
	const middle = getLastIndicators(indicators, 'middle');
	const macdLine = getLastIndicators(indicators, 'macdLine');
	const signalLine = getLastIndicators(indicators, 'signalLine');
	const histogram = getLastIndicators(indicators, 'histogram');
	const prevHistogram = indicators.histogram[indicators.histogram.length - 2];

	// 多头信号条件
	const longCondition =
		// price <= lower && // 价格触及下轨
		price > middle && // 价格触及中轨
		macdLine > signalLine && // MACD金叉
		histogram > prevHistogram && // 动量增强
		ohlcv[ohlcv.length - 1][5] > ohlcv[ohlcv.length - 2][5] * 1.2; // 成交量放大

	// 空头信号条件
	const shortCondition =
		// price >= upper && // 价格触及上轨
		price < middle && // 价格触及中轨
		macdLine < signalLine && // MACD死叉
		histogram < prevHistogram && // 动量减弱
		ohlcv[ohlcv.length - 1][5] > ohlcv[ohlcv.length - 2][5] * 1.2;

	console.log('################################');
	console.log(
		'time',
		moment(candles[candles.length - 1][0]).format('YYYY-MM-DD HH:mm:ss')
	);
	console.log('currentPrice', currentPrice);
	console.log('uper', upper);
	console.log('lower', lower);
	console.log('middle', middle);
	console.log('macdLine', macdLine);
	console.log('signalLine', signalLine);
	console.log('histogram', histogram);
	console.log('prevHistogram', prevHistogram);
	console.log(
		'volumn',
		ohlcv[ohlcv.length - 1][5],
		ohlcv[ohlcv.length - 2][5]
	);
	// console.log('ema', ema9Current, ema21Current, ema55Current);
	console.log('position', state.position);
	console.log('side', state.side);
	console.log('################################');

	return {
		buySignal: longCondition,
		sellSignal: shortCondition,
		price: currentPrice,
	};
}

// 风险管理模块
class RiskManager {
	static checkStopConditions(signal) {
		if (state.position === 0) return false;

		const { buySignal, sellSignal, price: currentPrice } = signal;

		const { side } = state;
		let isStop = false;

		isStop = side === 'buy' ? sellSignal : buySignal;

		// 更新价格极值
		state.highestPrice = Math.max(state.highestPrice, currentPrice);
		state.lowestPrice = Math.min(state.lowestPrice, currentPrice);

		let hardStopPrice;
		let trailingStopPrice;
		// let finalStopPrice;
		let hardTakeProfitPrice;

		// 计算止盈止损价
		if (side === 'buy') {
			hardStopPrice = state.entryPrice * (1 - config.stopLoss);
			hardTakeProfitPrice = state.entryPrice * (1 + config.takeProfit);
			if (currentPrice < state.entryPrice) {
				isStop = isStop || currentPrice <= hardStopPrice;
			} else {
				trailingStopPrice =
					state.highestPrice * (1 - config.trailingStop);
				// isStop = isStop || currentPrice >= hardTakeProfitPrice;
			}
		} else {
			hardStopPrice = state.entryPrice * (1 + config.stopLoss);
			hardTakeProfitPrice = state.entryPrice * (1 - config.takeProfit);
			if (currentPrice > state.entryPrice) {
				isStop = isStop || currentPrice >= hardStopPrice;
			} else {
				trailingStopPrice =
					state.lowestPrice * (1 + config.trailingStop);
				// isStop = isStop || currentPrice <= hardTakeProfitPrice;
			}
		}
		console.log('***********************************');
		console.log('entryPrice', state.entryPrice);
		console.log('hardStopPrice', hardStopPrice);
		console.log('hardTakeProfitPrice', hardTakeProfitPrice);
		console.log('trailingStopPrice', trailingStopPrice);
		console.log('highestPrice', state.highestPrice);
		console.log('lowestPrice', state.lowestPrice);
		console.log('isStop', isStop);
		console.log('***********************************');
		return isStop;
	}

	static async closePosition(currentPrice) {
		const side = state.position > 0 ? 'sell' : 'buy';
		const amount = Math.abs(state.position);

		console.log(
			`强制平仓 | 方向:${side} 数量:${amount} 均价:${state.entryPrice} 当前价:${currentPrice}`
		);

		await exchange.createOrder(
			config.symbol,
			'market',
			side,
			amount,
			null,
			{
				positionSide: side === 'sell' ? 'LONG' : 'SHORT',
			}
		);

		// 重置状态
		state.position = 0;
		state.entryPrice = 0;
		state.highestPrice = 0;
		state.lowestPrice = 0;

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
	ohlcv = await exchange.fetchOHLCV(
		config.symbol,
		config.timeframe,
		undefined,
		config.coldStartBars
	);
	console.log(`已加载${ohlcv.length}根历史K线`);
}

// 策略主逻辑
async function strategyLoop() {
	try {
		// const candles = await exchange.fetchOHLCV(
		// 	config.symbol,
		// 	config.timeframe,
		// 	undefined,
		// 	100
		// );
		// ohlcv = candles;
		const candles = ohlcv;
		const currentPrice = candles[candles.length - 1][4];

		// 步骤1: 清理过期订单
		await OrderManager.checkOrderStatus(currentPrice);

		// 步骤2: 获取信号
		const signal = await generateSignal(candles, currentPrice);
		const orderBook = await getOrderBook();

		// 步骤3: 检查强制平仓
		if (await RiskManager.checkStopConditions(signal)) {
			await RiskManager.closePosition(signal.price);
			return;
		}

		// 步骤4: 生成限价单
		if (state.position === 0 && !RiskManager.isCoolingDown()) {
			if (signal.buySignal && orderBook.spread < orderBook.ask * 0.001) {
				const limitPrice = orderBook.bid * (1 - config.orderDepth);
				const amount = config.tradeAmount / limitPrice;

				await OrderManager.createLimitOrder('buy', amount, limitPrice);
				console.log(`挂买单 | 价格:${limitPrice} 数量:${amount}`);
			}

			if (signal.sellSignal && orderBook.spread < orderBook.bid * 0.001) {
				const limitPrice = orderBook.ask * (1 + config.orderDepth);
				const amount = config.tradeAmount / limitPrice;

				await OrderManager.createLimitOrder('sell', amount, limitPrice);
				console.log(`挂卖单 | 价格:${limitPrice} 数量:${amount}`);
			}
		}
	} catch (err) {
		console.log('time', moment().format('YYYY-MM-DD HH:mm:ss'));
		console.error('策略错误:', err.message);
		restart(err.message);
	}
}

async function initPositionData() {
	const positionResult = await cAuthClientBN.swap.getPosition();
	const { positions, availableBalance } = positionResult;
	if (positions) {
		const holding = positions.find(
			(item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
		);
		if (holding) {
			state = {
				activeOrders: [], // 活跃限价单
				position: Number(holding.positionAmt), // 当前持仓数量
				entryPrice: Number(holding.entryPrice), // 持仓均价
				highestPrice: Number(holding.entryPrice), // 持仓期间最高价
				lowestPrice: Number(holding.entryPrice), // 持仓期间最低价
				side: holding.positionSide === 'LONG' ? 'buy' : 'sell',
			};
		}
	}
}

// 实时数据订阅
function connectWebSocket() {
	const symbolForWS = config.symbol.replace('/', '').toLowerCase();
	ws = new WebSocket(
		'wss://fstream.binance.com/ws/' + symbolForWS + '@kline_1m'
	);

	ws.on('open', () => {
		console.log('WebSocket连接已建立');
	});

	ws.on('message', async (data) => {
		const msg = JSON.parse(data);
		await handleKlineUpdate(msg);
	});

	ws.on('error', (err) => {
		console.error('WebSocket错误:', err);
	});
}

// 处理K线更新
async function handleKlineUpdate(msg) {
	const kline = msg.k;
	if (!kline.x) return; // 仅处理闭合K线

	// 更新OHLCV数据
	const newBar = [
		kline.t, // 时间戳
		parseFloat(kline.o), // 开盘价
		parseFloat(kline.h), // 最高价
		parseFloat(kline.l), // 最低价
		parseFloat(kline.c), // 收盘价
		parseFloat(kline.v), // 成交量
	];

	// 维护固定长度的数据窗口
	if (ohlcv.length >= config.coldStartBars) {
		ohlcv.shift();
	}
	ohlcv.push(newBar);

	await strategyLoop();
}

// 启动策略
(async () => {
	await exchange.loadMarkets();
	await initPositionData();
	connectWebSocket();
	// await strategyLoop();
	// setInterval(strategyLoop, 15000); // 每15秒运行一次
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
