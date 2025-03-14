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

// 配置参数
const config = {
	symbol: 'DOGE/USDT',
	exchange: 'binance',
	timeframe: '1m', // 1分钟周期
	bollPeriod: 14, // BOLL参数
	bollStdDev: 3.0,
	macdFast: 8, // MACD参数
	macdSlow: 17,
	macdSignal: 5,
	tradeAmount: 500, // 每笔交易数量(DOGE)
	stopLossPct: 1.2, // 止损百分比
	takeProfitPct: 2.5, // 止盈百分比
	maxLeverage: 5, // 最大杠杆
	maxPositions: 5, // 最大持仓数
	coldStartBars: 50, // 初始化所需K线数量
};

// 初始化交易所
const exchange = new ccxt.binance({
	apiKey: configBN.httpkey,
	secret: configBN.httpsecret,
	options: { defaultType: 'future' },
	enableRateLimit: true,
});

class HighFrequencyStrategy {
	constructor() {
		this.ohlcv = [];
		this.positions = new Map();
		this.tradeCount = 0;
		this.dailyPnL = 0;
		this.ws = null;
	}

	// 初始化历史数据
	async initialize() {
		console.log('正在获取历史数据...');
		this.ohlcv = await exchange.fetchOHLCV(
			config.symbol,
			config.timeframe,
			undefined,
			config.coldStartBars
		);
		console.log(`已加载${this.ohlcv.length}根历史K线`);
	}

	// 实时数据订阅
	connectWebSocket() {
		const symbolForWS = config.symbol.replace('/', '').toLowerCase();
		this.ws = new WebSocket(
			'wss://fstream.binance.com/ws/' + symbolForWS + '@kline_1m'
		);

		this.ws.on('open', () => {
			console.log('WebSocket连接已建立');
		});

		this.ws.on('message', async (data) => {
			const msg = JSON.parse(data);
			await this.handleKlineUpdate(msg);
		});

		this.ws.on('error', (err) => {
			console.error('WebSocket错误:', err);
		});
	}

	// 处理K线更新
	async handleKlineUpdate(msg) {
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
		if (this.ohlcv.length >= config.coldStartBars) {
			this.ohlcv.shift();
		}
		this.ohlcv.push(newBar);
		// 生成交易信号
		const signal = await this.generateSignal();
		if (signal) {
			await this.executeTrade(signal);
		}

		// 监控持仓状态
		await this.monitorPositions();
	}

	// 计算技术指标
	async calculateIndicators() {
		const closes = this.ohlcv.map((t) => t[4]);

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
		console.log('boll', boll);
		console.log('macd', macd);

		return {
			lower: boll[0],
			middle: boll[1],
			upper: boll[2],
			macdLine: macd[0],
			signalLine: macd[1],
			histogram: macd[2],
		};
	}

	getLastIndicators(indicators, key) {
		return indicators[key][indicators[key].length - 1];
	}

	// 生成交易信号
	async generateSignal() {
		if (this.ohlcv.length < config.coldStartBars) return null;

		const indicators = await this.calculateIndicators();

		// 当前指标值
		const price = this.ohlcv[this.ohlcv.length - 1][4];
		const upper = this.getLastIndicators(indicators, 'upper');
		const lower = this.getLastIndicators(indicators, 'lower');
		const macdLine = this.getLastIndicators(indicators, 'macdLine');
		const signalLine = this.getLastIndicators(indicators, 'signalLine');
		const histogram = this.getLastIndicators(indicators, 'histogram');
		const prevHistogram =
			indicators.histogram[indicators.histogram.length - 2];

		// 多头信号条件
		const longCondition =
			price <= lower && // 价格触及下轨
			macdLine > signalLine && // MACD金叉
			histogram > prevHistogram && // 动量增强
			this.ohlcv[this.ohlcv.length - 1][5] >
				this.ohlcv[this.ohlcv.length - 2][5] * 1.2; // 成交量放大

		// 空头信号条件
		const shortCondition =
			price >= upper && // 价格触及上轨
			macdLine < signalLine && // MACD死叉
			histogram < prevHistogram && // 动量减弱
			this.ohlcv[this.ohlcv.length - 1][5] >
				this.ohlcv[this.ohlcv.length - 2][5] * 1.2;

		console.log('################################');
		console.log(
			'time',
			moment(this.ohlcv[this.ohlcv.length - 1][0]).format(
				'YYYY-MM-DD HH:mm:ss'
			)
		);
		console.log('price', price);
		console.log('uper', upper);
		console.log('lower', lower);
		console.log('macdLine', macdLine);
		console.log('signalLine', signalLine);
		console.log('histogram', histogram);
		console.log('prevHistogram', prevHistogram);
		console.log(
			'volumn',
			this.ohlcv[this.ohlcv.length - 1][5],
			this.ohlcv[this.ohlcv.length - 2][5]
		);
		console.log('################################');

		if (longCondition) return { action: 'BUY', price };
		if (shortCondition) return { action: 'SELL', price };
		return null;
	}

	// 执行交易
	async executeTrade(signal) {
		if (!this.checkRisk()) return;

		try {
			const order = await exchange.createOrder(
				config.symbol,
				'MARKET',
				signal.action,
				config.tradeAmount,
				null,
				{
					stopLoss: this.calculateStopPrice(signal),
					takeProfit: this.calculateTakeProfit(signal),
					positionSide: signal.action === 'BUY' ? 'LONG' : 'SHORT',
				}
			);

			// 记录持仓
			this.positions.set(
				order.id,
				Object.assign(order, {
					entryPrice: order.average,
					stopLoss: order.stopLoss,
					takeProfit: order.takeProfit,
					timestamp: Date.now(),
				})
			);

			this.tradeCount++;
			console.log(
				`[${new Date().toISOString()}] 执行${signal.action} @ ${
					order.average
				}`
			);
		} catch (err) {
			console.error('交易执行失败:', err);
		}
	}

	// 计算止损价
	calculateStopPrice(signal) {
		return signal.action === 'BUY'
			? signal.price * (1 - config.stopLossPct / 100)
			: signal.price * (1 + config.stopLossPct / 100);
	}

	// 计算止盈价
	calculateTakeProfit(signal) {
		return signal.action === 'BUY'
			? signal.price * (1 + config.takeProfitPct / 100)
			: signal.price * (1 - config.takeProfitPct / 100);
	}

	// 风控检查
	checkRisk() {
		// 单日交易次数限制
		if (this.tradeCount > 200) {
			console.log('触发单日交易次数限制');
			return false;
		}

		// 最大持仓限制
		if (this.positions.size >= config.maxPositions) {
			console.log('达到最大持仓限制');
			return false;
		}

		// 单日亏损熔断
		if (this.dailyPnL < -config.maxDailyLoss) {
			console.log('触发单日亏损熔断');
			return false;
		}

		return true;
	}

	// 监控持仓状态
	async monitorPositions() {
		const ticker = await exchange.fetchTicker(config.symbol);
		const currentPrice = ticker.last;

		for (const [id, position] of this.positions) {
			const isLong = position.side === 'buy';
			const stopHit = isLong
				? currentPrice <= position.stopLoss
				: currentPrice >= position.stopLoss;

			const profitHit = isLong
				? currentPrice >= position.takeProfit
				: currentPrice <= position.takeProfit;

			if (stopHit || profitHit) {
				await this.closePosition(id, currentPrice);
			}
		}
	}

	// 平仓处理
	async closePosition(positionId, exitPrice) {
		try {
			const position = this.positions.get(positionId);
			await exchange.cancelOrder(position.id);

			const pnl =
				position.side === 'buy'
					? (exitPrice - position.entryPrice) * position.amount
					: (position.entryPrice - exitPrice) * position.amount;

			this.dailyPnL += pnl;

			console.log(
				`平仓 ${position.side.toUpperCase()} | ` +
					`盈亏: ${pnl.toFixed(2)} USDT | ` +
					`累计盈亏: ${this.dailyPnL.toFixed(2)} USDT`
			);

			this.positions.delete(positionId);
		} catch (err) {
			console.error('平仓失败:', err);
		}
	}

	// 启动策略
	async start() {
		await this.initialize();
		this.connectWebSocket();
		console.log('策略已启动');
	}
}

// 运行策略
(async () => {
	const strategy = new HighFrequencyStrategy();
	await strategy.start();
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
