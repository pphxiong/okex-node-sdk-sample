// const Binance = require('node-binance-api');
const TechnicalIndicators = require('technicalindicators');

// const binance = new Binance();

// 市场状态判断函数
function judgeMarketState(
	klines,
	adxPeriod = 14,
	bbPeriod = 20,
	bbDev = 2,
	adxThreshold = 25
) {
	if (klines.length < Math.max(adxPeriod, bbPeriod) + 1) {
		throw new Error('数据长度不足');
	}

	// 提取OHLC数据
	const highs = klines.map((k) => parseFloat(k[2])); // high
	const lows = klines.map((k) => parseFloat(k[3])); // low
	const closes = klines.map((k) => parseFloat(k[4])); // close

	// 计算ADX
	const adxInput = {
		high: highs,
		low: lows,
		close: closes,
		period: adxPeriod,
	};
	const adxValues = TechnicalIndicators.ADX.calculate(adxInput);

	// 计算布林带
	const bbInput = {
		period: bbPeriod,
		values: closes,
		stdDev: bbDev,
	};
	const bbResults = TechnicalIndicators.BollingerBands.calculate(bbInput);

	// 获取最新的指标值
	const currentAdx = adxValues[adxValues.length - 1].adx;
	const currentBB = bbResults[bbResults.length - 1];

	// 计算布林带宽度（标准化）
	const bbWidth = (currentBB.upper - currentBB.lower) / currentBB.middle;

	// 计算动态布林带宽度阈值（历史20%分位数）
	const historicalBBWidths = bbResults
		.slice(-100)
		.map((bb) => (bb.upper - bb.lower) / bb.middle);
	historicalBBWidths.sort((a, b) => a - b);
	const bbWidthThreshold =
		historicalBBWidths[Math.floor(historicalBBWidths.length * 0.2)];

	console.log(
		'\n=== 当前市场指标 ===',
		currentAdx,
		bbWidth,
		bbWidthThreshold
	);
	console.log(
		`当前指标 - ADX: ${currentAdx}, BB宽度: ${bbWidth}, 阈值: ${bbWidthThreshold}`
	);

	// 逻辑判断
	const isTrendStrengthHigh = currentAdx > adxThreshold;
	const isVolatilityLow = bbWidth < bbWidthThreshold;

	if (isTrendStrengthHigh && !isVolatilityLow) {
		return {
			state: 'Trending',
			signal: 1,
			adx: currentAdx,
			bbWidth: bbWidth,
		};
	} else if (!isTrendStrengthHigh && isVolatilityLow) {
		return {
			state: 'Ranging',
			signal: 0,
			adx: currentAdx,
			bbWidth: bbWidth,
		};
	} else {
		return {
			state: 'Uncertain',
			signal: -1,
			adx: currentAdx,
			bbWidth: bbWidth,
		};
	}
}

// 获取K线数据并判断市场状态
// async function analyzeMarket(symbol = 'DOGEUSDT', interval = '1h', limit = 200) {
//     try {
//         console.log(`正在分析 ${symbol} 市场状态...`);

//         // 从币安获取K线数据
//         const klines = await binance.futuresCandles(symbol, interval, { limit: limit });

//         if (!klines || klines.length === 0) {
//             throw new Error('未能获取到K线数据');
//         }

//         // 判断市场状态
//         const marketState = judgeMarketState(klines);

//         console.log('\n=== 市场状态分析结果 ===');
//         console.log(`交易对: ${symbol}`);
//         console.log(`时间周期: ${interval}`);
//         console.log(`市场状态: ${marketState.state}`);
//         console.log(`ADX值: ${marketState.adx.toFixed(2)}`);
//         console.log(`布林带宽度: ${marketState.bbWidth.toFixed(4)}`);

//         // 交易建议
//         console.log('\n=== 交易建议 ===');
//         switch (marketState.signal) {
//             case 1:
//                 console.log('✅ 趋势市 detected - 建议积极使用三周期EMA策略');
//                 console.log('   • 正常或加大仓位');
//                 console.log('   • 顺趋势方向交易');
//                 console.log('   • 让利润奔跑');
//                 break;
//             case 0:
//                 console.log('⚠️ 震荡市 detected - 建议暂停三周期EMA策略');
//                 console.log('   • 减少交易频率或停止交易');
//                 console.log('   • 降低仓位或使用震荡策略');
//                 console.log('   • 等待趋势突破');
//                 break;
//             case -1:
//                 console.log('🔶 不确定状态 - 建议保持谨慎');
//                 console.log('   • 降低仓位执行');
//                 console.log('   • 等待更明确的信号');
//                 console.log('   • 严格止损');
//                 break;
//         }

//         return marketState;

//     } catch (error) {
//         console.error('分析市场状态时出错:', error.message);
//         throw error;
//     }
// }

// 实时监控函数
class MarketStateMonitor {
	constructor(symbol = 'DOGEUSDT', interval = '1h') {
		this.symbol = symbol;
		this.interval = interval;
		this.previousState = null;
	}

	async startMonitoring() {
		console.log(`开始监控 ${this.symbol} 市场状态...`);

		// 立即执行一次分析
		await this.analyze();

		// 设置定时器，根据K线间隔定期分析
		const intervals = {
			'1m': 60 * 1000,
			'5m': 5 * 60 * 1000,
			'15m': 15 * 60 * 1000,
			'1h': 60 * 60 * 1000,
			'4h': 4 * 60 * 60 * 1000,
		};

		const intervalMs = intervals[this.interval] || 60 * 60 * 1000;

		setInterval(async () => {
			await this.analyze();
		}, intervalMs);
	}

	async analyze() {
		try {
			const currentState = await analyzeMarket(
				this.symbol,
				this.interval
			);

			// 检查状态是否发生变化
			if (
				this.previousState &&
				this.previousState.signal !== currentState.signal
			) {
				console.log(
					`\n🎯 市场状态发生变化: ${this.previousState.state} → ${currentState.state}`
				);
				this.sendNotification(currentState);
			}

			this.previousState = currentState;
		} catch (error) {
			console.error('监控分析出错:', error.message);
		}
	}

	sendNotification(state) {
		// 这里可以集成邮件、短信、Telegram等通知方式
		console.log(`🚨 市场状态警报: ${state.state}`);
		// 实际应用中，这里可以调用通知API
		// 例如: sendTelegramMessage(`市场状态变为: ${state.state}`);
	}
}

// 使用示例
async function main() {
	try {
		// 单次分析
		console.log('=== 单次市场状态分析 ===');
		await analyzeMarket('DOGEUSDT', '1h');

		// 启动实时监控（取消注释以启用）
		// const monitor = new MarketStateMonitor('DOGEUSDT', '1h');
		// await monitor.startMonitoring();
	} catch (error) {
		console.error('主程序执行出错:', error);
	}
}

// 导出函数供其他模块使用
module.exports = {
	judgeMarketState,
	// analyzeMarket,
	MarketStateMonitor,
};

// 如果直接运行此文件，执行main函数
// if (require.main === module) {
//     main();
// }
