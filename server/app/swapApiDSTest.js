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
	exchange: 'binance',
	timeframe: '1m',

	// BOLL参数
	bollPeriod: 14,
	bollStdDev: 3.0,

	// MACD参数
	macdFast: 8,
	macdSlow: 17,
	macdSignal: 5,

	// 交易参数
	tradeAmount: 1000, // 基础交易量
	stopLossPct: 1.5, // 止损百分比
	takeProfitPct: 3, // 止盈百分比
	maxLeverage: 3, // 最大杠杆

	// 风控参数
	dailyLossLimit: -5, // 单日最大亏损百分比
	maxPositions: 3, // 最大同时持仓数
};

// 初始化交易所
const exchange = new ccxt.binance({
	apiKey: configBN.httpkey,
	secret: configBN.httpsecret,
	options: { defaultType: 'future' }, // 永续合约
	enableRateLimit: true,
});

class BollingerMacdStrategy {
	constructor() {
		this.ohlcv = [];
		this.positions = [];
		this.tradeHistory = [];
		this.dailyProfit = 0;
	}

	// 加载历史数据
	async loadHistoricalData(days = 30) {
		const since = moment().subtract(days, 'days').valueOf();
		this.ohlcv = await exchange.fetchOHLCV(
			config.symbol,
			config.timeframe,
			since,
			null,
			{ limit: 1000 }
		);
	}

	// 计算技术指标
	async calculateIndicators() {
		const closes = this.ohlcv.map((t) => t[4]);

		// 计算BOLL
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
		console.log(23, this.ohlcv, this.ohlcv.length);

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
		const indicators = await this.calculateIndicators();

		// 当前价格和指标值
		const price = this.ohlcv[this.ohlcv.length - 1][4];
		const upper = this.getLastIndicators(indicators, 'upper');
		const lower = this.getLastIndicators(indicators, 'lower');
		const macdLine = this.getLastIndicators(indicators, 'macdLine');
		const signalLine = this.getLastIndicators(indicators, 'signalLine');
		const histogram = this.getLastIndicators(indicators, 'histogram');
		const prevHistogram =
			indicators.histogram[indicators.histogram.length - 2];
		console.log(11, this.ohlcv);
		console.log(22, indicators);
		// 多头信号
		if (
			price <= lower &&
			macdLine > signalLine &&
			histogram > prevHistogram
		) {
			return { signal: 'BUY', triggerPrice: price };
		}

		// 空头信号
		if (
			price >= upper &&
			macdLine < signalLine &&
			histogram < prevHistogram
		) {
			return { signal: 'SELL', triggerPrice: price };
		}

		return null;
	}

	// 执行交易
	async executeTrade(signal) {
		try {
			// 检查风控
			if (!this.checkRiskManagement()) return;

			// 创建订单
			const order = await exchange.createOrder(
				config.symbol,
				'market',
				signal.signal.toLowerCase(),
				config.tradeAmount,
				null,
				{
					stopLossPrice:
						signal.signal === 'BUY'
							? signal.triggerPrice *
							  (1 - config.stopLossPct / 100)
							: signal.triggerPrice *
							  (1 + config.stopLossPct / 100),
					takeProfitPrice:
						signal.signal === 'BUY'
							? signal.triggerPrice *
							  (1 + config.takeProfitPct / 100)
							: signal.triggerPrice *
							  (1 - config.takeProfitPct / 100),
				}
			);

			// 记录持仓
			this.positions.push(
				Object.assign(order, {
					entryPrice: order.price,
					stopLoss: order.stopLossPrice,
					takeProfit: order.takeProfitPrice,
					timestamp: Date.now(),
				})
			);

			console.log(`执行交易：${signal.signal} @ ${order.price}`);
		} catch (err) {
			console.error('订单错误:', err);
		}
	}

	// 风控检查
	checkRiskManagement() {
		// 单日亏损限制
		if (this.dailyProfit < config.dailyLossLimit) {
			console.log('触发单日亏损限制，停止交易');
			return false;
		}

		// 最大持仓限制
		if (this.positions.length >= config.maxPositions) {
			console.log('达到最大持仓限制');
			return false;
		}

		return true;
	}

	// 监控平仓条件
	async checkExitConditions() {
		const ticker = await exchange.fetchTicker(config.symbol);
		const currentPrice = ticker.last;

		this.positions = this.positions.filter((position) => {
			const isLong = position.side === 'buy';
			const stopHit = isLong
				? currentPrice <= position.stopLoss
				: currentPrice >= position.stopLoss;

			const profitHit = isLong
				? currentPrice >= position.takeProfit
				: currentPrice <= position.takeProfit;

			if (stopHit || profitHit) {
				this.recordTradeResult(position, currentPrice, stopHit);
				return false;
			}
			return true;
		});
	}

	// 记录交易结果
	recordTradeResult(position, exitPrice, isStopLoss) {
		const pnl =
			position.side === 'buy'
				? (exitPrice - position.entryPrice) / position.entryPrice
				: (position.entryPrice - exitPrice) / position.entryPrice;

		this.tradeHistory.push(
			Object.assign(position, {
				exitPrice,
				pnl,
				isStopLoss,
			})
		);

		this.dailyProfit += pnl;
	}

	// 回测运行
	async backtest(days = 30) {
		await this.loadHistoricalData(days);
		console.log(23, this.ohlcv);
		for (let i = config.bollPeriod; i < this.ohlcv.length; i++) {
			this.ohlcv = this.ohlcv.slice(0, i + 1);
			const signal = await this.generateSignal();
			if (signal) await this.executeTrade(signal);
			await this.checkExitConditions();
		}

		this.generateReport();
	}

	// 生成报告
	generateReport() {
		const wins = this.tradeHistory.filter((t) => t.pnl > 0);
		const losses = this.tradeHistory.filter((t) => t.pnl <= 0);

		console.log(`
      === 策略回测报告 ===
      总交易次数: ${this.tradeHistory.length}
      胜率: ${((wins.length / this.tradeHistory.length) * 100).toFixed(1)}%
      平均盈利: ${(
			(wins.reduce((s, t) => s + t.pnl, 0) / wins.length) *
			100
		).toFixed(2)}%
      平均亏损: ${(
			(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) *
			100
		).toFixed(2)}%
      最大回撤: ${this.calculateMaxDrawdown().toFixed(2)}%
      夏普比率: ${this.calculateSharpeRatio().toFixed(2)}
    `);
	}

	calculateMaxDrawdown() {
		let peak = 0;
		let maxDrawdown = 0;
		let equity = 0;

		this.tradeHistory.forEach((trade) => {
			equity += trade.pnl;
			if (equity > peak) peak = equity;
			const dd = (peak - equity) / peak;
			if (dd > maxDrawdown) maxDrawdown = dd;
		});

		return maxDrawdown * 100;
	}

	calculateSharpeRatio(riskFreeRate = 0.03) {
		const returns = this.tradeHistory.map((t) => t.pnl);
		const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
		const stdDev = Math.sqrt(
			returns
				.map((x) => Math.pow(x - avgReturn, 2))
				.reduce((a, b) => a + b, 0) / returns.length
		);
		return (avgReturn - riskFreeRate) / stdDev;
	}
}

// 实盘运行
(async () => {
	const strategy = new BollingerMacdStrategy();

	// 运行回测
	await strategy.backtest(90);

	// // 实盘循环
	// setInterval(async () => {
	// 	// 更新K线数据
	// 	const newOhlcv = await exchange.fetchOHLCV(
	// 		config.symbol,
	// 		config.timeframe,
	// 		undefined,
	// 		5
	// 	);
	// 	strategy.ohlcv = [...strategy.ohlcv, ...newOhlcv].slice(-100);

	// 	// 生成信号
	// 	const signal = await strategy.generateSignal();
	// 	if (signal) await strategy.executeTrade(signal);

	// 	// 检查平仓
	// 	await strategy.checkExitConditions();
	// }, 300000); // 每5分钟运行一次
})();

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
