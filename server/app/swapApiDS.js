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
			emaSettings: {
				periods: { '15m': [13, 34], '5m': [5, 21], '1m': [3, 8] },
				slopeThreshold: 0.1, // EMA斜率阈值
			},
			riskControl: {
				maxLoss: 0.05, // 单日最大亏损5%
				perTradeRisk: 0.02, // 单笔风险2%
				leverage: 3,
				coolingPeriod: 180, // 基础冷却时间(秒)
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

	async getHistory(symbol, interval) {
		const time = moment().valueOf();
		const payload = {
			interval,
			limit: 1440,
			endTime: time,
		};
		const list = await cAuthClientBN.common.getHistory(symbol, payload);
		const newList = JSON.parse(JSON.stringify(list));
		newList.pop();
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

		const ws = new ccxt.pro.binance().stream({
			method: 'SUBSCRIBE',
			params: streams,
		});
		ws.on('data', (data) => this.handleData(data));
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

		console.log(
			this.state.marketData['1m'].slice(-1),
			this.isBullish(emaValues),
			this.isBearish(emaValues),
			emaValues['1m'].slice(-1),
			emaValues['5m'].slice(-1),
			emaValues['15m'].slice(-1)
		);
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
			this.checkEMASlope('5m', emaValues) >
				this.config.emaSettings.slopeThreshold &&
			this.checkEMACross('1m', emaValues)
		);
	}

	isBearish(emaValues) {
		return (
			this.checkEMACross('15m', emaValues, false) &&
			this.checkEMASlope('5m', emaValues) <
				-this.config.emaSettings.slopeThreshold &&
			this.checkEMACross('1m', emaValues, false)
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
					leverage: this.config.riskControl.leverage,
					stopLoss: this.calculateSL(side),
					takeProfit: this.calculateTP(side),
				}
			);

			this.state.position = {
				side,
				size: order.amount,
				entryPrice: order.price,
				sl: order.stopLoss,
				tp: order.takeProfit,
				timestamp: Date.now(),
			};

			this.logTrade('open', order);
		} catch (err) {
			this.handleOrderError(err);
		}
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

	async checkPositionSL() {
		if (!this.state.position) return;

		let currentPrice;
		try {
			const symbol = this.config.symbol.replace('/', '');
			const data = await cAuthClientBN.common.getMarkPrice(symbol);
			currentPrice = Number(data.markPrice);
		} catch (e) {
			restart('getMarkPrice');
		}

		// 止损检查
		if (
			(this.state.position.side === 'long' &&
				currentPrice <= this.state.position.stopLoss) ||
			(this.state.position.side === 'short' &&
				currentPrice >= this.state.position.stopLoss)
		) {
			await this.closePosition('止损触发');
		}

		// 止盈检查
		if (
			(this.state.position.side === 'long' &&
				currentPrice >= this.state.position.takeProfit) ||
			(this.state.position.side === 'short' &&
				currentPrice <= this.state.position.takeProfit)
		) {
			await this.closePosition('止盈触发');
		}

		// // 时间止损
		// const duration = Date.now() - this.state.position.openedAt;
		// if (duration > 30 * 60 * 1000) {
		// 	// 30分钟
		// 	await this.closePosition('时间止损');
		// }
	}

	// 风险管理系统
	startRiskEngine() {
		setInterval(async () => {
			this.checkDailyLossLimit();
			this.checkPositionSL();
			this.updateCoolingStatus();
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
