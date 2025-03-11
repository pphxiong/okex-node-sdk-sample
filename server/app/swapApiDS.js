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
const EventEmitter = require('events');
require('dotenv').config();

const configBN = require('./configBN2');
const cAuthClientBN = new customAuthClientBN(
	configBN.httpkey,
	configBN.httpsecret,
	configBN.urlHost
);

class DogePerpBot extends EventEmitter {
	constructor() {
		super();

		// 初始化交易所连接
		this.exchange = new ccxt.binance({
			apiKey: configBN.httpkey,
			secret: configBN.httpsecret,
			options: {
				defaultType: 'future',
				adjustForTimeDifference: true,
				hedgeMode: true,
			},
		});

		// 策略配置
		this.config = {
			symbol: 'DOGE/USDT',
			timeframes: ['15m', '5m', '1m'],
			dynamicEMA: true,
			emaSettings: {
				periods: { '15m': [13, 34], '5m': [5, 21], '1m': [3, 8] },
				slopeThreshold: 0.2 / 100, // EMA斜率阈值
			},
			atrSettings: {
				period: 7,
				stopLossMultiplier: 1.5,
				takeProfitMultiplier: 2.5,
			},
			riskControl: {
				baseRisk: 0.02,
				volatilityMultiplier: 1.5,
				maxLoss: 0.05, // 单日最大亏损5%
				perTradeRisk: 0.02, // 单笔风险2%
				leverage: 20,
				coolingPeriod: 180, // 基础冷却时间(秒)
			},
			modelPaths: {
				lstm: './models/lstm_model/',
				volatility: './models/volatility_predictor/',
			},
		};

		// 状态管理
		this.state = {
			position: null,
			coolingUntil: 0,
			dailyMetrics: {
				profit: 0,
				trades: 0,
				winRate: 0,
			},
			marketData: {
				'15m': [],
				'5m': [],
				'1m': [],
			},
		};
	}

	// 动态EMA计算
	async calculateDynamicEMA(timeframe) {
		// const atr = this.calculateATR(14);
		let periods;

		if (this.config.dynamicEMA) {
			const prediction = await this.calculateVolatility();
			periods =
				prediction > 0.7
					? { fast: 7, slow: 21 }
					: prediction > 0.4
					? { fast: 13, slow: 34 }
					: { fast: 21, slow: 55 };
		} else {
			periods = { fast: 13, slow: 34 };
		}

		const closes = this.state.marketData[timeframe].map((d) => d.close);
		const [emaFast, emaSlow] = await Promise.all([
			this.calculateEMA(periods.fast, closes),
			this.calculateEMA(periods.slow, closes),
		]);

		return { emaFast, emaSlow, periods };
	}

	async calculateATR() {
		try {
			const atrPeriod = this.config.atrSettings.period;
			// 获取K线数据（需要至少atrPeriod+1根K线）
			const klines = this.state.marketData['1m'];

			// 提取高、低、收盘价
			const highs = klines.map((k) => k.high);
			const lows = klines.map((k) => k.low);
			const closes = klines.map((k) => k.close);

			// 使用tulind计算ATR
			const atrResults = await new Promise((resolve, reject) => {
				tulind.indicators.atr.indicator(
					[highs, lows, closes],
					[atrPeriod],
					(err, results) => {
						if (err) reject(err);
						else resolve(results[0]);
					}
				);
			});

			// 最新ATR值
			const currentATR = atrResults[atrResults.length - 1];
			return currentATR.toFixed(6);
		} catch (error) {
			console.error('计算ATR失败:', error.message);
			return null;
		}
	}

	// // 增强信号生成
	// async generateEnhancedSignal() {
	// 	const conditions = {
	// 		trend: await this.checkTrendCondition(),
	// 		momentum: this.checkMomentum(),
	// 		volume: this.checkVolumeProfile(),
	// 		orderBook: this.checkOrderBookImbalance(),
	// 		sentiment: await this.checkSentiment(),
	// 	};

	// 	const mlPrediction = await this.getLSTMPrediction();

	// 	return {
	// 		long:
	// 			conditions.trend.up &&
	// 			conditions.momentum > 0.7 &&
	// 			conditions.volume &&
	// 			mlPrediction > 0.65,
	// 		short:
	// 			conditions.trend.down &&
	// 			conditions.momentum < 0.3 &&
	// 			conditions.volume &&
	// 			mlPrediction < 0.35,
	// 	};
	// }

	// async loadMLModels() {
	//   this.models.lstm = await tf.loadLayersModel(`${this.config.modelPaths.lstm}model.json`);
	//   this.models.volatility = await tf.loadGraphModel(
	//     `${this.config.modelPaths.volatility}model.json`
	//   );
	// }

	async getHistory(symbol, interval) {
		const time = moment().valueOf();
		const payload = {
			interval,
			limit: 1440,
			endTime: time,
		};
		const list = await cAuthClientBN.common.getHistory(symbol, payload);
		const newList = JSON.parse(JSON.stringify(list));
		// newList.pop();
		return newList;
	}

	async getHistoryDatas() {
		const symbol = this.config.symbol.replace('/', '');
		const list1 = await this.getHistory(symbol, '15m');
		const list2 = await this.getHistory(symbol, '5m');
		const list3 = await this.getHistory(symbol, '1m');
	}

	parseKLine(data) {
		return {
			timestamp: data[0],
			open: parseFloat(data[1]),
			high: parseFloat(data[2]),
			low: parseFloat(data[3]),
			close: parseFloat(data[4]),
			volume: parseFloat(data[5]),
		};
	}

	async initialize() {
		await this.loadMarkets();
		await this.initPositionData();
		// this.getHistoryDatas();
		// this.setupWebSocket();
		this.startRiskEngine();
		console.log('=== 交易系统启动 ===');
	}

	async loadMarkets() {
		await this.exchange.loadMarkets();
		console.log('市场数据加载完成');
	}

	async setupWebSocket() {
		const streams = [
			`${this.config.symbol.replace('/', '').toLowerCase()}@kline_15m`,
			`${this.config.symbol.replace('/', '').toLowerCase()}@kline_5m`,
			`${this.config.symbol.replace('/', '').toLowerCase()}@kline_1m`,
			`${this.config.symbol.replace('/', '').toLowerCase()}@bookTicker`,
		];

		// const ws = new ccxt.pro.binance().stream({
		// 	method: 'SUBSCRIBE',
		// 	params: streams,
		// });
		// ws.on('data', (data) => this.handleData(data));

		// const ws = new ccxt.pro.binance().websocket;
		// ws.subscribe(this.config.symbol, '5m', 'kline');
		// ws.on('kline', (symbol, timeframe, kline) => {
		// 	console.log(11, kline);
		// 	if (kline.closed) executeStrategy(); // 每根K线结束时触发
		// });
	}

	handleData(data) {
		try {
			if (data.k) this.processCandle(data.k);
			if (data.s === this.config.symbol) this.updateOrderBook(data);
		} catch (err) {
			this.emit('error', err);
		}
	}

	processCandle(kline) {
		const tf = this.parseTimeframe(kline.i);
		if (kline.x) {
			// K线闭合
			this.updateMarketData(tf, {
				time: kline.t,
				open: parseFloat(kline.o),
				high: parseFloat(kline.h),
				low: parseFloat(kline.l),
				close: parseFloat(kline.c),
				volume: parseFloat(kline.v),
			});
			this.checkTradingSignal(tf);
		}
	}

	async initPositionData() {
		const positionResult = await cAuthClientBN.swap.getPosition();
		const { positions, availableBalance } = positionResult;
		if (positions) {
			const holding = positions.find(
				(item) =>
					item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
			);
			if (holding) {
				this.state.position = {
					side: holding.positionSide.toLowerCase(),
					size: Math.abs(Number(holding.positionAmt)),
					entryPrice: Number(holding.entryPrice),
					// stopLoss: Number(holding.stopPrice),
					// takeProfit: Number(holding.stopPrice) * 1.5,
					timestamp: holding.updateTime,
				};
			}
		}
	}

	// 同步历史K线数据
	async syncAllTimeframes() {
		for (const tf of Object.keys(this.state.marketData)) {
			const data = await this.exchange.fetchOHLCV(
				'DOGE/USDT',
				tf,
				undefined,
				100
			);
			data.pop();
			this.state.marketData[tf] = data.map((d) => this.parseKLine(d));
		}
	}

	parseKLine(data) {
		return {
			timestamp: moment(data[0]).format('YYYY-MM-DD HH:mm:ss'),
			open: parseFloat(data[1]),
			high: parseFloat(data[2]),
			low: parseFloat(data[3]),
			close: parseFloat(data[4]),
			volume: parseFloat(data[5]),
		};
	}

	async checkTradingSignal() {
		if (this.isCoolingDown() || this.state.position) return;

		const signals = await this.generateSignal();
		if (signals.long) this.executeTrade('buy');
		if (signals.short) this.executeTrade('sell');
	}

	async generateSignal() {
		const emaValues = {};
		for (const tf of this.config.timeframes) {
			emaValues[tf] = await this.calculateEMA(tf);
		}

		// const price = this.getLastPrice();
		const volumeValid = this.checkVolume();
		const liquidity = this.checkLiquidity();

		// console.log(this.state.marketData['1m'].slice(-2));
		// console.log('long', this.isBullish(emaValues));
		// console.log('short', this.isBearish(emaValues));
		// console.log(this.checkEMASlope('5m', emaValues));
		// console.log(this.checkEMACross('15m', emaValues, false));
		// console.log(this.checkEMACross('1m', emaValues, false));

		return {
			long: this.isBullish(emaValues) && volumeValid && liquidity,
			short: this.isBearish(emaValues) && volumeValid && liquidity,
		};
	}

	checkVolume() {
		return true;
	}

	checkLiquidity() {
		return true;
	}

	async calculateEMA(tf) {
		const periods = this.config.emaSettings.periods[tf];
		const closes = this.state.marketData[tf].map((c) => c.close);
		const [emaFast, emaSlow] = await Promise.all([
			this.calculateSingleEMA(periods[0], closes),
			this.calculateSingleEMA(periods[1], closes),
		]);
		return { emaFast, emaSlow };
	}

	async calculateSingleEMA(period, data) {
		return new Promise((resolve) => {
			tulind.indicators.ema.indicator([data], [period], (err, res) => {
				resolve(res[0]);
			});
		});
	}

	isBullish(emaValues) {
		return (
			this.checkEMACross('15m', emaValues) &&
			this.checkEMACross('5m', emaValues) &&
			this.checkEMACross('1m', emaValues) &&
			this.checkEMASlope('5m', emaValues) >
				this.config.emaSettings.slopeThreshold
		);
	}

	isBearish(emaValues) {
		return (
			this.checkEMACross('15m', emaValues, false) &&
			this.checkEMACross('5m', emaValues, false) &&
			this.checkEMACross('1m', emaValues, false) &&
			this.checkEMASlope('5m', emaValues) <
				-this.config.emaSettings.slopeThreshold
		);
	}

	checkEMACross(tf, emaValues, isBullish = true) {
		const { emaFast, emaSlow } = emaValues[tf];
		const lastFast = emaFast.slice(-1)[0];
		const lastSlow = emaSlow.slice(-1)[0];
		return isBullish ? lastFast > lastSlow : lastFast < lastSlow;
	}

	checkEMASlope(tf, emaValues) {
		const { emaFast } = emaValues[tf];
		const lastTwo = emaFast.slice(-2);
		return (lastTwo[1] - lastTwo[0]) / lastTwo[0];
	}

	async calculatePositionSize() {
		return 1500;
	}

	async calculateSL(side, entryPrice) {
		// const entryPrice = this.state.position.entryPrice;
		// const entryPrice = await this.getMarkPrice();
		const stopLoss = side === 'buy' ? entryPrice * 0.95 : entryPrice * 1.05;
		return stopLoss;
	}

	async calculateTP(side, entryPrice) {
		// const entryPrice = this.state.position.entryPrice;
		// const entryPrice = await this.getMarkPrice();
		const takeProfit = side === 'buy' ? entryPrice * 1.1 : entryPrice * 0.9;
		return takeProfit;
	}

	async executeTrade(side) {
		try {
			const size = await this.calculatePositionSize();
			const order = await this.exchange.createOrder(
				this.config.symbol,
				'market',
				side,
				size,
				null,
				{
					positionSide: side === 'buy' ? 'LONG' : 'SHORT',
					leverage: this.config.riskControl.leverage,
					// stopLoss: this.calculateSL(side),
					// takeProfit: this.calculateTP(side),
				}
			);

			this.state.position = {
				side,
				size: order.amount,
				entryPrice: order.price,
				stopLoss: this.calculateSL(side, order.price),
				takeProfit: this.calculateTP(side, order.price),
				timestamp: Date.now(),
			};

			this.logTrade('open', order);
		} catch (err) {
			this.handleOrderError(err);
		}
	}

	handleOrderError(err) {
		console.log('订单错误::', err);
	}

	async closePosition(reason) {
		try {
			const order = await this.exchange.createOrder(
				this.config.symbol,
				'market',
				this.state.position.side === 'buy' ? 'sell' : 'buy',
				this.state.position.size
			);

			this.logTrade('close', order, reason);
			this.activateCooldown();
			this.state.position = null;
		} catch (err) {
			this.handleOrderError(err);
		}
	}

	logTrade(direction, order, reason) {
		console.log('########################');
		console.log(moment().format('YYYY-MM-DD HH:mm:ss'));
		console.log('reason::', reason);
		console.log('direction::', direction);
		console.log('order::', order);
		console.log('########################');
	}

	async getMarkPrice() {
		let price;
		try {
			const symbol = this.config.symbol.replace('/', '');
			const data = await cAuthClientBN.common.getMarkPrice(symbol);
			price = Number(data.markPrice);
		} catch (e) {
			restart('getMarkPrice');
		}

		return price;
	}

	async checkPositionSL() {
		if (!this.state.position) return;

		// const currentPrice = await this.getMarkPrice();
		const currentPrice = this.state.position.entryPrice;
		const currentATR = await this.calculateATR();

		const { stopLossMultiplier, takeProfitMultiplier, period } =
			this.config.atrSettings;

		// 计算止损止盈价格（做多为例）
		const stopLossPrice =
			this.state.position.side === 'long'
				? (currentPrice - currentATR * stopLossMultiplier).toFixed(6)
				: (currentPrice + currentATR * stopLossMultiplier).toFixed(6);
		const takeProfitPrice =
			this.state.position.side === 'long'
				? (currentPrice + currentATR * takeProfitMultiplier).toFixed(6)
				: (currentPrice - currentATR * takeProfitMultiplier).toFixed(6);

		console.log(`当前价格: ${currentPrice}`);
		console.log(`ATR(${period}): ${currentATR}`);
		console.log(`动态止损价: ${stopLossPrice}`);
		console.log(`动态止盈价: ${takeProfitPrice}`);

		// const { stopLoss, takeProfit } = this.state.position;
		// 止损检查
		if (
			(this.state.position.side === 'long' &&
				currentPrice <= stopLossPrice) ||
			(this.state.position.side === 'short' &&
				currentPrice >= stopLossPrice)
		) {
			await this.closePosition('止损触发');
		}

		// 止盈检查
		if (
			true ||
			(this.state.position.side === 'long' &&
				currentPrice >= takeProfitPrice) ||
			(this.state.position.side === 'short' &&
				currentPrice <= takeProfitPrice)
		) {
			await this.closePosition('止盈触发');
		}

		// // 时间止损
		// const duration = Date.now() - this.state.position.timestamp;
		// if (duration > 30 * 60 * 1000) {
		// 	// 30分钟
		// 	await this.closePosition('时间止损');
		// }
	}

	// 风险管理系统
	startRiskEngine() {
		setInterval(async () => {
			// this.checkDailyLossLimit();
			this.updateCoolingStatus();
			await this.checkPositionSL();
			await this.syncAllTimeframes();
			await this.checkTradingSignal();
		}, 5000 * 2);
	}

	updateCoolingStatus() {}

	checkDailyLossLimit() {
		if (this.state.dailyMetrics.profit < -this.config.riskControl.maxLoss) {
			console.error('触发最大日亏损限制，停止交易');
			process.exit(1);
		}
	}

	// 辅助方法
	calculateVolatility() {
		const closes = this.state.marketData['1m']
			.slice(-14)
			.map((c) => c.close);
		return Math.max(...closes) - Math.min(...closes);
	}

	activateCooldown() {
		const base = this.config.riskControl.coolingPeriod;
		const lossFactor = this.state.dailyMetrics.winRate < 0.5 ? 1.5 : 1;
		const cooldown = base * lossFactor * 1000;

		this.state.coolingUntil = Date.now() + cooldown;
		console.log(`交易冷却激活，持续时间：${cooldown / 1000}秒`);
	}

	isCoolingDown() {
		return Date.now() < this.state.coolingUntil;
	}

	// 其他实现细节...
	// [包含：仓位计算、止盈止损、订单簿分析、日志记录等]
}

// 启动程序
(async () => {
	try {
		const bot = new DogePerpBot();
		await bot.initialize();

		process.on('SIGINT', async () => {
			console.log('\n安全关闭中...');
			if (bot.state.position) await bot.closePosition('系统关闭');
			process.exit();
		});
	} catch (err) {
		console.error('启动失败:', err);
	}
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
