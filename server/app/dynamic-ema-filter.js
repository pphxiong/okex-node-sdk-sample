const tulind = require('tulind');

class DynamicEMAFilterWithATR {
	constructor() {
		this.baseThreshold = 0.002; // 0.8%基础阈值
		this.atrPeriod = 14;
	}

	// 基于ATR的动态阈值计算
	async calculateDynamicThreshold(klines) {
		try {
			// 计算ATR
			const atrData = await this.calculateATR(klines, this.atrPeriod);
			const currentPrice = parseFloat(klines[klines.length - 1].close);
			const normalizedVolatility = atrData.atr / currentPrice;

			console.log(
				`ATR: ${atrData.atr.toFixed(4)}, 标准化波动率: ${(
					normalizedVolatility * 100
				).toFixed(2)}%`
			);

			// 基于波动率动态调整阈值
			if (normalizedVolatility > 0.04) {
				// 高波动市场：放宽阈值（更容易交易）
				const adjustedThreshold = this.baseThreshold * 1.3;
				console.log(
					`高波动市场，阈值从${this.baseThreshold}放宽到${adjustedThreshold}`
				);
				return adjustedThreshold;
			} else if (normalizedVolatility < 0.015) {
				// 低波动市场：收紧阈值（更严格过滤）
				const adjustedThreshold = this.baseThreshold * 0.7;
				console.log(
					`低波动市场，阈值从${this.baseThreshold}收紧到${adjustedThreshold}`
				);
				return adjustedThreshold;
			} else {
				// 正常波动：使用基础阈值
				return this.baseThreshold;
			}
		} catch (error) {
			console.error('计算动态阈值时出错，使用基础阈值:', error);
			return this.baseThreshold;
		}
	}

	// 自适应过滤决策
	async shouldFilterAdaptive(emaFast, emaSlow, klines) {
		const dynamicThreshold = await this.calculateDynamicThreshold(klines);
		const proximity =
			Math.abs(emaFast - emaSlow) / Math.max(emaFast, emaSlow);

		const shouldFilter = proximity < dynamicThreshold;

		if (shouldFilter) {
			console.log(
				`过滤信号: EMA接近度${(proximity * 100).toFixed(2)}% < 阈值${(
					dynamicThreshold * 100
				).toFixed(2)}%`
			);
		}

		return shouldFilter;
	}

	// 获取详细的信号强度分析
	async getSignalStrengthWithATR(emaFast, emaSlow, klines) {
		const dynamicThreshold = await this.calculateDynamicThreshold(klines);
		const proximity =
			Math.abs(emaFast - emaSlow) / Math.max(emaFast, emaSlow);
		const atrData = await this.calculateATR(klines, this.atrPeriod);

		// 信号强度评分
		let strengthScore = 0;

		// 基于EMA接近度的评分
		if (proximity > dynamicThreshold * 2) strengthScore += 0.6;
		else if (proximity > dynamicThreshold * 1.5) strengthScore += 0.4;
		else if (proximity > dynamicThreshold) strengthScore += 0.2;

		// 基于波动率的评分（高波动市场信号更可靠）
		const normalizedVolatility =
			atrData.atr / parseFloat(klines[klines.length - 1].close);
		if (normalizedVolatility > 0.03) strengthScore += 0.2;
		else if (normalizedVolatility < 0.01) strengthScore -= 0.1;

		console.log('strengthScore:', strengthScore);

		// 转换为强度等级
		if (strengthScore >= 0.6) return 'strong';
		if (strengthScore >= 0.4) return 'good';
		if (strengthScore >= 0.2) return 'weak';

		return 'filtered';
	}

	// 使用tulind计算ATR
	async calculateATR(klines, period = 14) {
		const highs = klines.map((d) => d.high);
		const lows = klines.map((d) => d.low);
		const closes = klines.map((d) => d.close);

		if (highs.length < period + 1) {
			throw new Error(`数据不足，需要至少${period + 1}根K线`);
		}

		const atrResults = await tulind.indicators.atr.indicator(
			[highs, lows, closes],
			[period]
		);

		const currentATR = atrResults[0][atrResults[0].length - 1];
		const currentPrice = closes[closes.length - 1];

		return {
			atr: currentATR,
			normalizedATR: currentATR / currentPrice,
			allValues: atrResults[0],
		};
	}
}

module.exports = {
	DynamicEMAFilterWithATR,
};
