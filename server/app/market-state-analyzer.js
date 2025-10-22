// const Binance = require('node-binance-api');
const TechnicalIndicators = require('technicalindicators');

// const binance = new Binance();

// 市场状态判断函数
function judgeMarketState(
	klines,
	adxPeriod = 14,
	bbPeriod = 20,
	bbDev = 2.2,
	adxThreshold = 22,
	bbWidthPercentile = 0.15
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
	const bbWidthValues = bbResults.map(
		(bb) => (bb.upper - bb.lower) / bb.middle
	);

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
		historicalBBWidths[
			Math.floor(historicalBBWidths.length * bbWidthPercentile)
		];

	console.log(
		`当前指标 - ADX: ${currentAdx}, BB宽度: ${bbWidth}, 阈值: ${bbWidthThreshold}`
	);

	// 逻辑判断
	const isTrendStrengthHigh = currentAdx > adxThreshold;
	const isVolatilityLow = bbWidth < bbWidthThreshold;

	if (isTrendStrengthHigh && !isVolatilityLow) {
		return {
			state: 'trending',
			signal: 1,
			adx: currentAdx,
			bbWidth: bbWidth,
			// confidence: calculateConfidence(currentAdx, bbWidth),
			confidence: calculateDynamicConfidence(
				adxValues.slice(-10),
				bbWidthValues.slice(-10),
				closes.slice(-10)
			),
		};
	} else if (!isTrendStrengthHigh && isVolatilityLow) {
		return {
			state: 'ranging',
			signal: 0,
			adx: currentAdx,
			bbWidth: bbWidth,
			// confidence: calculateConfidence(currentAdx, bbWidth),
			confidence: calculateDynamicConfidence(
				adxValues.slice(-10),
				bbWidthValues.slice(-10),
				closes.slice(-10)
			),
		};
	} else {
		return {
			state: 'uncertain',
			signal: -1,
			adx: currentAdx,
			bbWidth: bbWidth,
			// confidence: calculateConfidence(currentAdx, bbWidth),
			confidence: calculateDynamicConfidence(
				adxValues.slice(-10),
				bbWidthValues.slice(-10),
				closes.slice(-10)
			),
		};
	}
}

// 置信度计算（辅助函数）
function calculateConfidence(adx, bbWidth) {
	let confidence = 0.5; // 基础置信度

	// ADX越高，趋势判断置信度越高
	if (adx > 30) confidence += 0.3;
	else if (adx > 25) confidence += 0.2;
	else if (adx > 20) confidence += 0.1;

	// 布林带宽度极端值增加置信度
	if (bbWidth < 0.03) confidence += 0.1; // 极低波动
	if (bbWidth > 0.07) confidence += 0.1; // 极高波动

	return Math.min(confidence, 0.95); // 最大95%置信度
}

function calculateDynamicConfidence(adxSeries, bbWidthSeries, priceSeries) {
	if (adxSeries.length < 5 || bbWidthSeries.length < 5) {
		return 0.5; // 数据不足时返回中性置信度
	}

	let confidence = 0.5; // 基础置信度

	// 1. ADX动量分析（3期变化率）
	const adxMomentum = calculateMomentum(adxSeries, 3);
	const adxAcceleration = calculateMomentum(adxSeries.slice(-4), 2); // 加速度

	// 2. 布林带宽度动量
	const bbMomentum = calculateMomentum(bbWidthSeries, 3);

	// 3. 价格动量确认
	const priceMomentum = calculateMomentum(priceSeries, 3);

	const currentADX = adxSeries[adxSeries.length - 1];
	const currentBBWidth = bbWidthSeries[bbWidthSeries.length - 1];

	// 动态ADX阈值（基于近期波动）
	const dynamicADXThreshold = calculateDynamicADXThreshold(adxSeries);

	// 4. 趋势强度评分（考虑动量和水平）
	let trendStrength = 0;

	// ADX水平得分
	if (currentADX > dynamicADXThreshold * 1.5) trendStrength += 0.3;
	else if (currentADX > dynamicADXThreshold) trendStrength += 0.2;
	else if (currentADX > dynamicADXThreshold * 0.7) trendStrength += 0.1;

	// ADX动量得分
	if (adxMomentum > 0.1) trendStrength += 0.2; // 快速上升
	else if (adxMomentum > 0.05) trendStrength += 0.1; // 缓慢上升
	else if (adxMomentum < -0.1) trendStrength -= 0.1; // 快速下降

	// ADX加速度得分
	if (adxAcceleration > 0.05) trendStrength += 0.1; // 加速上升
	else if (adxAcceleration < -0.05) trendStrength -= 0.05; // 加速下降

	// 5. 波动性评分
	let volatilityScore = 0;

	// 布林带宽度得分
	const bbWidthPercentile = calculatePercentile(
		bbWidthSeries,
		currentBBWidth
	);
	if (bbWidthPercentile < 0.2) volatilityScore += 0.2; // 极低波动
	else if (bbWidthPercentile > 0.8) volatilityScore += 0.1; // 极高波动

	// 布林带动量得分
	if (bbMomentum < -0.1) volatilityScore += 0.1; // 快速收窄（可能爆发前夜）
	else if (bbMomentum > 0.1) volatilityScore += 0.05; // 快速扩张

	// 6. 方向一致性得分
	const directionConsistency = calculateDirectionConsistency(
		adxMomentum,
		priceMomentum
	);
	const consistencyScore = directionConsistency * 0.2;

	// 7. 综合置信度
	confidence = 0.5 + trendStrength + volatilityScore + consistencyScore;

	return Math.min(Math.max(confidence, 0.1), 0.95); // 限制在10%-95%
}

// 辅助函数：计算动量（变化率）
function calculateMomentum(series, period = 3) {
	if (series.length < period + 1) return 0;

	const current = series[series.length - 1];
	const previous = series[series.length - 1 - period];

	return (current - previous) / previous;
}

// 辅助函数：计算动态ADX阈值
function calculateDynamicADXThreshold(adxSeries) {
	if (adxSeries.length < 20) return 25; // 默认值

	const recentADX = adxSeries.slice(-20);
	const avgADX = recentADX.reduce((a, b) => a + b, 0) / recentADX.length;

	// 动态阈值：近期平均ADX + 调整
	return Math.max(20, Math.min(30, avgADX * 1.1));
}

// 辅助函数：计算百分位
function calculatePercentile(series, value) {
	const sorted = [...series].sort((a, b) => a - b);
	const index = sorted.findIndex((x) => x >= value);
	return index / sorted.length;
}

// 辅助函数：计算方向一致性
function calculateDirectionConsistency(adxMomentum, priceMomentum) {
	// ADX上升 + 价格动量强 = 高一致性
	if (adxMomentum > 0.05 && Math.abs(priceMomentum) > 0.02) {
		return 1.0;
	}
	// ADX下降 + 价格动量弱 = 中等一致性
	else if (adxMomentum < -0.05 && Math.abs(priceMomentum) < 0.01) {
		return 0.5;
	}
	// 其他情况 = 低一致性
	else {
		return 0.2;
	}
}

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
