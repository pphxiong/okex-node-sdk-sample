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
const fs = require('fs');

// 增强策略配置
const config = {
	symbol: 'DOGE/USDT',
	timeframes: ['1h', '15m', '5m'],
	emaSettings: {
		'1h': { period: 34, slopeWindow: 5 },
		'15m': { period: 21, slopeWindow: 3 },
		'5m': { period: 13, slopeWindow: 2 },
	},
	riskParams: {
		baseRisk: 0.02, // 基础风险比例
		dynamicRisk: true, // 启用动态风险调整
		maxLeverage: 3,
		stopLoss: {
			// 动态止损配置
			initial: 1.5, // 初始ATR倍数
			trailing: 0.5, // 追踪止损ATR倍数
		},
		takeProfit: 2.2, // 止盈ATR倍数
	},
	filters: {
		volume: {
			enabled: true,
			multiplier: 1.3, // 成交量过滤倍数
			period: 5,
		},
		rsi: {
			enabled: true,
			period: 14,
			overbought: 70,
			oversold: 30,
		},
	},
	backtest: {
		startDate: '2023-12-01',
		endDate: '2023-12-31',
		initialBalance: 5000,
	},
};

class EnhancedTripleEMAStrategy {
	constructor() {
		this.exchange = new ccxt.binanceusdm();
		this.data = {
			'1h': [],
			'15m': [],
			'5m': [],
			merged: [], // 对齐后的合并数据
		};
		this.trades = [];
		this.analytics = {
			parameters: [],
			performance: {},
		};
	}

	// 增强数据加载（支持断点续传）
	async loadData() {
		try {
			const since = moment(config.backtest.startDate).valueOf();
			const until = moment(config.backtest.endDate).valueOf();

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
							1000
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
		} catch (e) {
			console.error('Data loading failed:', e.message);
			process.exit(1);
		}
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

	// 多周期时间戳对齐
	mergeTimeframes() {
		const baseTimestamps = this.data['5m'].map((c) => c.timestamp);

		config.timeframes.forEach((tf) => {
			if (tf === '5m') return;
			this.data[tf] = this.data[tf].filter((c) =>
				baseTimestamps.includes(c.timestamp)
			);
		});

		this.data.merged = baseTimestamps.map((ts, idx) => ({
			timestamp: ts,
			'5m': this.data['5m'][idx],
			'15m': this.data['15m'].find((c) => c.timestamp === ts),
			'1h': this.data['1h'].find((c) => c.timestamp === ts),
		}));
	}

	// 增强指标计算（带缓存机制）
	async calculateIndicators() {
		try {
			const indicatorPromises = [];

			// 多周期EMA计算
			config.timeframes.forEach((tf) => {
				const closes = this.data[tf].map((c) => c.close);
				const period = config.emaSettings[tf].period;

				indicatorPromises.push(
					tulind.indicators.ema
						.indicator([closes], [period])
						.then((ema) => {
							this.data[tf].forEach((c, i) => {
								if (i >= period) c.ema = ema[0][i - period];
							});
						})
				);
			});

			// RSI计算
			if (config.filters.rsi.enabled) {
				const closes = this.data['15m'].map((c) => c.close);
				indicatorPromises.push(
					tulind.indicators.rsi
						.indicator([closes], [config.filters.rsi.period])
						.then((rsi) => {
							this.data['15m'].forEach((c, i) => {
								if (i >= config.filters.rsi.period)
									c.rsi =
										rsi[0][i - config.filters.rsi.period];
							});
						})
				);
			}

			await Promise.all(indicatorPromises);
			this.calculateSlopes();
		} catch (e) {
			console.error('Indicator calculation failed:', e);
		}
	}

	calculateSlopes() {
		config.timeframes.forEach((tf) => {
			const period = config.emaSettings[tf].period;
			const slopeWindow = config.emaSettings[tf].slopeWindow;

			this.data[tf].forEach((c, i) => {
				if (i >= period + slopeWindow) {
					const currentEMA = c.ema;
					const prevEMA = this.data[tf][i - slopeWindow].ema;
					c.slope = (currentEMA - prevEMA) / slopeWindow;
				}
			});
		});
	}

	// 动态风险计算
	calculateDynamicRisk(atr) {
		const volatilityRatio = atr / this.analytics.avgATR;
		let riskMultiplier = 1;

		if (volatilityRatio > 1.5) riskMultiplier = 0.7;
		else if (volatilityRatio < 0.5) riskMultiplier = 1.3;

		return config.riskParams.baseRisk * riskMultiplier;
	}

	// 增强信号生成（多条件过滤）
	generateSignal(mergedCandle) {
		const { '1h': h1, '15m': m15, '5m': m5 } = mergedCandle;

		// 基础斜率条件
		const bullSlope =
			h1.slope > 0.0025 && m15.slope > 0.004 && m5.slope > 0.006;

		const bearSlope =
			h1.slope < -0.0025 && m15.slope < -0.004 && m5.slope < -0.006;

		// 成交量过滤
		const volumeFilter = config.filters.volume.enabled
			? m15.volume >
			  this.sma(m15.volume, config.filters.volume.period) *
					config.filters.volume.multiplier
			: true;

		// RSI过滤
		const rsiFilter = config.filters.rsi.enabled
			? (bullSlope && m15.rsi < config.filters.rsi.overbought) ||
			  (bearSlope && m15.rsi > config.filters.rsi.oversold)
			: true;

		return {
			direction: bullSlope ? 'long' : bearSlope ? 'short' : null,
			strength: Math.abs(
				h1.slope * 0.4 + m15.slope * 0.35 + m5.slope * 0.25
			),
			passedFilters: volumeFilter && rsiFilter,
		};
	}

	// 增强回测引擎
	async runEnhancedBacktest() {
		const atrValues = await this.calculateATR('15m');
		this.analytics.avgATR =
			atrValues.reduce((a, b) => a + b, 0) / atrValues.length;

		let balance = config.backtest.initialBalance;
		let maxBalance = balance;
		let drawdown = 0;

		for (const [index, merged] of this.data.merged.entries()) {
			if (index < 100) continue; // 跳过初始化阶段

			const signal = this.generateSignal(merged);
			const atr = atrValues[index];

			if (signal.direction && signal.passedFilters) {
				const risk = config.riskParams.dynamicRisk
					? this.calculateDynamicRisk(atr)
					: config.riskParams.baseRisk;

				const positionSize =
					(balance * risk) /
					(atr * config.riskParams.stopLoss.initial);

				// 执行交易逻辑
				const tradeResult = this.executeTrade(
					merged['15m'],
					signal.direction,
					positionSize,
					atr
				);

				balance += tradeResult.profit;
				this.trades.push(tradeResult);

				// 更新最大回撤
				maxBalance = Math.max(maxBalance, balance);
				drawdown = Math.max(
					drawdown,
					(maxBalance - balance) / maxBalance
				);
			}
		}

		this.analytics.performance = {
			finalBalance: balance,
			totalReturn: (balance / config.backtest.initialBalance - 1) * 100,
			maxDrawdown: drawdown * 100,
			tradeCount: this.trades.length,
		};
	}

	// 增强交易执行（含滑点模拟）
	executeTrade(candle, direction, size, atr) {
		const entryPrice = this.applySlippage(candle, direction);
		const exitRules = {
			stopLoss:
				direction === 'long'
					? entryPrice - atr * config.riskParams.stopLoss.initial
					: entryPrice + atr * config.riskParams.stopLoss.initial,
			takeProfit:
				direction === 'long'
					? entryPrice + atr * config.riskParams.takeProfit
					: entryPrice - atr * config.riskParams.takeProfit,
			trailingStop: null,
		};

		// 模拟持仓管理
		let exitPrice;
		let exitReason;
		for (let i = 0; i < 24; i++) {
			// 最多持仓24根5分钟K线
			const currentCandle = this.data.merged[candle.index + i];
			if (!currentCandle) break;

			// 更新追踪止损
			if (direction === 'long') {
				exitRules.trailingStop = Math.max(
					exitRules.trailingStop || exitRules.stopLoss,
					currentCandle['5m'].low -
						atr * config.riskParams.stopLoss.trailing
				);
			} else {
				exitRules.trailingStop = Math.min(
					exitRules.trailingStop || exitRules.stopLoss,
					currentCandle['5m'].high +
						atr * config.riskParams.stopLoss.trailing
				);
			}

			// 检查退出条件
			if (this.checkExitCondition(currentCandle, direction, exitRules)) {
				exitPrice = this.applySlippage(
					currentCandle,
					direction === 'long' ? 'sell' : 'buy'
				);
				exitReason = this.getExitReason(
					currentCandle,
					direction,
					exitRules
				);
				break;
			}
		}

		// 计算交易结果
		const fee = size * 0.0004 * 2; // 双边手续费
		const priceDiff =
			direction === 'long'
				? exitPrice - entryPrice
				: entryPrice - exitPrice;
		const profit = priceDiff * size - fee;

		return {
			entryPrice,
			exitPrice,
			profit,
			duration: (currentCandle.timestamp - candle.timestamp) / 60000,
			reason: exitReason,
		};
	}

	// 其他辅助方法...
}

// 执行优化回测
(async () => {
	const strategy = new EnhancedTripleEMAStrategy();

	console.log('加载数据...');
	await strategy.loadData();

	console.log('计算指标...');
	await strategy.calculateIndicators();

	console.log('运行增强回测...');
	await strategy.runEnhancedBacktest();

	console.log('生成报告...');
	// fs.writeFileSync('backtest_report.json', JSON.stringify({
	//   parameters: config,
	//   trades: strategy.trades,
	//   analytics: strategy.analytics
	// }, null, 2));

	console.log(
		'回测完成！最终余额:',
		strategy.analytics.performance.finalBalance.toFixed(2)
	);
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
