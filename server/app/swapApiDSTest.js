import moment from "moment";
import helper from "../utils/index";
const customAuthClientBN = require("./customAuthClientBN");

const express = require("express");
const app = express();

app.all("*", function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header("Access-Control-Allow-Headers", "content-type");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  res.header("X-Powered-By", " 3.2.1");
  res.header("Content-Type", "application/json;charset=utf-8");
  if (req.method.toLowerCase() == "options") res.send(200);
  //让options尝试请求快速结束
  else next();
});

const configBN = require("./configBN2");
const cAuthClientBN = new customAuthClientBN(
  configBN.httpkey,
  configBN.httpsecret,
  configBN.urlHost
);

const ccxt = require("ccxt");
const tulind = require("tulind");
const math = require("mathjs");
// const jstat = require('jstat');
const _ = require("lodash");

// 策略配置
const config = {
  symbol: "DOGE/USDT",
  timeframe: "15m",
  timeframes: ["15m" /* '5m'  '1m'*/], // 多周期参数
  emaSettings: {
    // '30m': { periods: [10, 5], slopeWindow: 5 },
    "15m": { periods: [25, 5], slopeWindow: 5 },
    // '5m': { periods: [10, 5], slopeWindow: 5 },
  },
  macdParams: { "15m": [12, 26, 9] /* '5m': [12, 26, 9] */ },
  slowframe: "15m",
  fastframe: "15m",
  kWindowTresholdFast: 3,
  kWindowTresholdMedium: 5,
  // 布林线参数
  bollinger: {
    period: 20,
    stdDev: 1.8,
  },
  // EMA斜率参数
  emaSlope: {
    period: 10,
    lookback: 5, // 计算5根K线斜率
    emaSlopeThreshold: 0.005 * 0.01, // EMA斜率阈值
    // emaSlopeThreshold: 0, // EMA斜率阈值
  },
  atrParam: {
    // ATR参数
    atrPeriod: 14,
    stopLoss: 1.6,
    takeProfit: 6.4,
  },
  leverage: 20,
  riskPerTrade: 0.4, // 每笔交易风险2%
  feeRate: 2 / 10000, // 交易手续费0.04%
  slippage: 0, // 滑点率
  initialBalance: 1000, // 初始本金10000 USDT
  // coldStartBars: 480,
  // coldStartBars: {
  //   "1h": 24,
  //   "30m": 48,
  //   "15m": 160,
  //   "5m": 480,
  //   "1m": 480 * 5,
  // },
  coldStartBars: {
    "1h": 500,
    "30m": 500,
    "15m": 500,
    "5m": 500,
    "1m": 500,
  },
  simulations: 5000, // 模拟次数
  volatility: 0.04, // 日波动率（比特币历史平均约3-5%）
  drift: 0.0002, // 每日趋势偏移量
  adxPeriod: 14,
  rsiPeriod: 14,
};

class Backtester {
  constructor() {
    this.exchange = new ccxt.binance({
      apiKey: configBN.httpkey,
      secret: configBN.httpsecret,
      options: {
        adjustForTimeDifference: true,
        defaultType: "future",
        hedgeMode: true,
      },
    });
    this.data = {
      [config.slowframe]: [],
      [config.fastframe]: [],
      merged: [],
    };
    this.trades = [];
    this.balance = config.initialBalance;
    this.totalFee = 0;
  }

  covariance(x, y) {
    if (!Array.isArray(x) || !Array.isArray(y)) {
      throw new Error("需要两个数组作为参数");
    }
    if (x.length !== y.length) {
      throw new Error("数组长度必须相同");
    }

    const n = x.length;
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    return (
      x.reduce((acc, val, i) => acc + (val - meanX) * (y[i] - meanY), 0) /
      (n - 1)
    );
  }

  // // 多周期价格路径生成（带相关性）
  generateCorrelatedPaths(historicalData) {
    const paths = {};
    const tfs = Object.keys(historicalData);

    // 计算各周期收益率矩阵
    const returnsMatrix = tfs.map((tf) => {
      const closes = historicalData[tf].map((c) => c.close);
      return _.range(1, closes.length).map((i) =>
        Math.log(closes[i] / closes[i - 1])
      );
    });

    // 数据集
    // const data = math.matrix(returnsMatrix);

    // 构建协方差矩阵
    const covMatrix = math.variance(returnsMatrix);

    // Cholesky分解生成相关路径  cholesky
    const chol = math.chol(covMatrix);

    for (let s = 0; s < config.simulations; s++) {
      paths[s] = {};
      for (let tfi = 0; tfi < tfs.length; tfi++) {
        const tf = tfs[tfi];
        const basePrice = historicalData[tf][0].close;
        const path = [basePrice];

        for (let t = 1; t < historicalData[tf].length; t++) {
          const z = math.multiply(chol, math.random([tfs.length, 1]));
          const drift = 0.0002 * (t / 1440); // 时间加权利率
          const shock =
            z[tfi] *
            math.sqrt(config.emaSettings[config.slowframe].period / 20);
          path[t] = path[t - 1] * Math.exp(drift + shock);
        }
        paths[s][tf] = path;
      }
    }
    return paths;
  }

  // 时间轴对齐算法
  alignTimeframes(paths) {
    const masterTF = "5m"; // 以最短周期为基准
    const aligned = [];

    paths[masterTF].forEach((point, idx) => {
      const alignedTick = { [masterTF]: point };

      // 对齐更高周期
      config.timeframes
        .filter((tf) => tf !== masterTF)
        .forEach((tf) => {
          const ratio = this.getTimeframeRatio(masterTF, tf);
          alignedTick[tf] = paths[tf][Math.floor(idx / ratio)];
        });

      aligned.push(alignedTick);
    });

    return aligned;
  }

  // 时间周期转换比率
  getTimeframeRatio(baseTF, targetTF) {
    const tfMinutes = {
      "1m": 1,
      "5m": 5,
      "30m": 30,
      "1h": 60,
      "4h": 240,
      "1d": 1440,
    };
    return tfMinutes[targetTF] / tfMinutes[baseTF];
  }

  // 生成随机价格路径（几何布朗运动模型）
  generatePricePaths(historicalPrices) {
    const returns = [];
    for (let i = 1; i < historicalPrices.length; i++) {
      returns.push(
        Math.log(historicalPrices[i].close / historicalPrices[i - 1].close)
      );
    }

    const meanReturn = math.mean(returns);
    const stdReturn = math.std(returns);

    const paths = [];
    for (let s = 0; s < config.simulations; s++) {
      const path = [historicalPrices[0].close];
      for (let t = 1; t < historicalPrices.length; t++) {
        const shock = math.random(0, 1) * stdReturn + meanReturn;
        path[t] = path[t - 1] * Math.exp(shock);
      }
      paths.push(path);
    }
    return paths;
  }

  async loadHistoricalData(start, end, interval) {
    try {
      const since = moment(start).valueOf();
      const until = moment(end).valueOf();

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
              config.coldStartBars[tf]
            );

            if (candles.length === 0) break;

            allCandles = allCandles.concat(candles);
            currentSince = candles[candles.length - 1][0] + 1;

            // 限速处理
            await new Promise((resolve) => setTimeout(resolve, 200));
          }

          const paths = allCandles.map((c) => this.parseCandle(c));
          // paths = this.generatePricePaths(paths);
          this.data[tf] = paths;
          console.log(`Loaded ${this.data[tf].length} ${tf} candles`);
        })
      );

      this.mergeTimeframes();
      return this.data;
    } catch (e) {
      console.error("Data loading failed:", e.message);
      process.exit(1);
    }
  }

  // 多周期时间戳对齐
  mergeTimeframes() {
    const baseTimestamps = this.data[config.fastframe].map((c) => c.timestamp);

    config.timeframes.forEach((tf) => {
      if (tf === config.fastframe) return;
      this.data[tf] = this.data[tf].filter((c) =>
        baseTimestamps.includes(c.timestamp)
      );
    });
  }

  getTimeStampBefore(dataList, timestamp) {
    dataList = JSON.parse(JSON.stringify(dataList));
    let data;
    let i = 0;
    const period = config.fastframe.split("m")[0];

    while (true) {
      const time = moment(timestamp).subtract(Number(period) * i, "minutes");
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

  getTimeStampSlowBefore(dataList, timestamp) {
    dataList = JSON.parse(JSON.stringify(dataList));
    let data;

    const hour = moment(timestamp).format("YYYY-MM-DD HH:00:00");
    const lastHourTimestamp = moment(hour).subtract(1, "hours");

    const target = dataList.find(
      (c) => c.timestamp === lastHourTimestamp.valueOf()
    );
    if (target) {
      data = target;
    }
    return data;
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

  async calculateAdx(highs, lows, closes) {
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

  async calculateIndicators() {
    try {
      const indicatorPromises = [];

      config.timeframes.forEach(async (tf) => {
        // 计算布林带
        const closes = this.data[tf].map((d) => d.close);
        const highs = this.data[tf].map((d) => d.high);
        const lows = this.data[tf].map((d) => d.low);

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

        indicatorPromises.push(
          tulind.indicators.macd.indicator([closes], config.macdParams[tf])
        );

        indicatorPromises.push(this.calculateAdx(highs, lows, closes));

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
          macd,
          [adx, adxPlusDI, adxMinusDI],
          rsi,
        ] = result.slice(index * 7, (index + 1) * 7);
        // if (tf === config.slowframe) {
        // 	console.log(
        // 		23,
        // 		this.data[tf].length,
        // 		emaSlow[0].length,
        // 		emaFast[0].length
        // 	);
        // }

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
        this.data[tf].forEach((d, i) => {
          if (i >= config.bollinger.period) {
            const bbIndex = i - config.bollinger.period + 1;
            d.lower = bollinger[0][bbIndex];
            d.middle = bollinger[1][bbIndex];
            d.upper = bollinger[2][bbIndex];
          }
          if (i >= config.emaSettings[tf].slopeWindow) {
            const slopeIndex = i - config.emaSettings[tf].slopeWindow;
            d.emaSlope = emaSlopes[slopeIndex];
          }
          if (i >= config.macdParams[tf][1]) {
            const macdIndex = i - config.macdParams[tf][1] + 1;
            d.macd = macd ? macd[0][macdIndex] : null;
            d.macdHistogram = macd[0][macdIndex] - macd[1][macdIndex] || null;
          }
          if (i >= config.atrParam.atrPeriod) {
            const atrIndex = i - config.atrParam.atrPeriod + 1;
            d.atr = atr[0][atrIndex];
          }
          if (i >= config.adxPeriod) {
            // const offset = this.data[tf].length - adx[0].length;
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
          // d.adx = adx[0][i];
          d.marketType = this.getMarketType(d, this.data[tf][i - 1]);
        });
      });
    } catch (e) {
      console.error("指标计算错误:", e);
    }
  }

  getMarketType(candle, lastCandle) {
    let marketType = "不确定";
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
            marketType = adxMinusDI > 15 ? "趋势空" : "趋势多";
            if (
              adxMinusDI > 15 &&
              rsi > 75 &&
              emaSlope > config.emaSlope.emaSlopeThreshold * 2 &&
              adx >= 30
            )
              marketType = "趋势空且增强";
          } else if (
            rsi < 60 &&
            emaSlope > config.emaSlope.emaSlopeThreshold / 2
          ) {
            marketType = "趋势多且增强";
          }
        } else {
          if (adx < 20 && adx > 15) {
            if (rsi > 55) marketType = "趋势空且增强";
            if (rsi < 45) marketType = "趋势多且增强";
          }
        }
      } else if (close < emaSlow) {
        if (adxPlusDI < adxMinusDI) {
          if (rsi < 50) marketType = "趋势空且增强";
        }
        if (adxPlusDI > adxMinusDI) {
          if (rsi > 50) marketType = "趋势多且增强";
        }

        if (adx >= 25 && rsi > 40) marketType = "趋势多且增强";
        if (adx < 15) marketType = adxPlusDI > adxMinusDI ? "趋势多" : "趋势空";
        if (adx < 25) {
          marketType = rsi < 40 ? "趋势空" : "趋势多";
        }
        if (adx < 20 && rsi > 55 && adxPlusDI > adxMinusDI) {
          marketType = "趋势多且增强";
        }
        if (adx < 20 && rsi < 45 && adxPlusDI < adxMinusDI) {
          marketType = "趋势空且增强";
        }
      } else {
        if (adx < 25 && adx > 20) {
          if (rsi > 50) marketType = "趋势多且增强";
          if (rsi < 50) marketType = "趋势空且增强";
        }
      }
    }

    if (emaFast < emaSlow) {
      if (close < emaFast) {
        if (adxPlusDI < adxMinusDI) {
          if (rsi < 30) {
            marketType = "趋势多";
            if (
              rsi < 25 &&
              emaSlope < -config.emaSlope.emaSlopeThreshold * 2 &&
              adx >= 30
            )
              marketType = "趋势多且增强";
          } else if (
            rsi > 40 &&
            emaSlope < -config.emaSlope.emaSlopeThreshold / 2
          ) {
            marketType = "趋势空且增强";
          }
        } else {
          if (adx < 20 && adx > 15) {
            if (rsi > 55) marketType = "趋势空且增强";
            if (rsi < 45) marketType = "趋势多且增强";
          }
        }
      } else if (close > emaSlow) {
        if (adxPlusDI < adxMinusDI) {
          if (rsi < 50) marketType = "趋势空且增强";
        }
        if (adxPlusDI > adxMinusDI) {
          if (rsi > 50) marketType = "趋势多且增强";
        }
        if (adx < 15) marketType = adxPlusDI > adxMinusDI ? "趋势空" : "趋势多";
        if (adx < 20 && rsi > 55 && adxPlusDI > adxMinusDI) {
          marketType = "趋势多且增强";
        }
        if (adx < 20 && rsi < 45 && adxPlusDI < adxMinusDI) {
          marketType = "趋势空且增强";
        }
      } else {
      }
    }

    if (adxPlusDI > adxMinusDI && emaFast < emaSlow && close < emaFast) {
      if (rsi < 30 && emaSlope < -config.emaSlope.emaSlopeThreshold)
        marketType = "趋势空";
    }
    if (adxPlusDI < adxMinusDI && emaFast > emaSlow && close > emaFast) {
      if (rsi > 70 && emaSlope > config.emaSlope.emaSlopeThreshold)
        marketType = "趋势多";
    }

    return marketType;
  }

  getPositionSize(price, atr) {
    const riskAmount = this.balance * config.riskPerTrade;
    // return riskAmount / (atr * config.leverage);
    return 1000;
    // return riskAmount;
  }

  getLongShort(dataList, index, WindowTreshold) {
    const longs = dataList
      .slice(index - WindowTreshold + 1, index + 1)
      .filter((item) => item.close > item.open);
    const shorts = dataList
      .slice(index - WindowTreshold + 1, index + 1)
      .filter((item) => item.close < item.open);
    return { longs, shorts };
  }

  runBacktest() {
    let position = null;
    // let atr = 0;

    this.data[config.fastframe].forEach(async (d, index) => {
      // 跳过前50根K线确保指标稳定
      if (index < 30) return;
      // // 计算ATR
      // if (i >= config.atrParam.atrPeriod) {
      // 	const high = this.data
      // 		.slice(i - config.atrParam.atrPeriod, i)
      // 		.map((x) => x.high);
      // 	const low = this.data
      // 		.slice(i - config.atrParam.atrPeriod, i)
      // 		.map((x) => x.low);
      // 	const closes = this.data
      // 		.slice(i - config.atrParam.atrPeriod, i)
      // 		.map((x) => x.close);
      // 	atr = d.atr;
      // }

      const isLastIndex = index === this.data[config.fastframe].length - 1;

      const lastKline5M = JSON.parse(
        JSON.stringify(this.data[config.fastframe][index])
      );

      const secondKline5M = JSON.parse(
        JSON.stringify(this.data[config.fastframe][index - 1])
      );

      const candle = {
        // [config.slowframe]: this.getTimeStampBefore(
        // 	this.data[config.slowframe],
        // 	lastKline5M.timestamp
        // ),
        // [config.slowframe]: lastKline5M,
        [config.fastframe]: lastKline5M,
      };

      const { marketType: fastMarketType } = candle[config.fastframe];
      const { marketType: slowMarketType } = candle[config.slowframe];

      // 生成信号
      const signal = this.generateSignal(
        candle,
        secondKline5M,
        fastMarketType,
        slowMarketType
      );

      // 处理平仓
      if (position) {
        const isProfitTarget =
          position.direction === "long"
            ? d.close >= position.entryPrice * (1 + 0.1)
            : d.close <= position.entryPrice * (1 - 0.1);

        const isStopLoss =
          position.direction === "long"
            ? d.close <= position.entryPrice * (1 - 0.1 / 1)
            : d.close >= position.entryPrice * (1 + 0.1 / 1);

        const takeProfit =
          candle[config.fastframe].atr * config.atrParam.takeProfit;
        const stopLoss =
          candle[config.fastframe].atr * config.atrParam.stopLoss;

        // const isProfitTarget =
        // 	position.direction === 'long'
        // 		? d.close >= position.entryPrice + takeProfit
        // 		: d.close <= position.entryPrice - takeProfit;

        // const isStopLoss =
        // 	position.direction === 'long'
        // 		? d.close <= position.entryPrice * (1 - 0.1 / 2)
        // 		: d.close >= position.entryPrice * (1 + 0.1 / 2);

        // const isReverse =
        // 	position.direction === 'long'
        // 		? d.emaSlope < -config.emaSlope.emaSlopeThreshold
        // 		: d.emaSlope > config.emaSlope.emaSlopeThreshold;

        // const isReverse =
        // 	signal &&
        // 	((position.direction === 'long'
        // 		? signal.direction === 'short'
        // 		: signal.direction === 'long') ||
        // 		(false && (isStopLoss || isProfitTarget)));

        const lnp = this.getLnp(position, d);

        const longCloseConditions = [
          position.slowMarketType === "趋势多且增强" &&
            [
              "超买市",
              "趋势空且增强",
              "潜在转折空",
              "震荡市开空",
              "趋势潜在减弱",
              "趋势多且减弱",
              // '不确定',
              "趋势多只平不开",
              "趋势空",
            ].includes(slowMarketType),
          position.slowMarketType === "趋势潜在增强" &&
            [
              "超买市",
              "趋势空且增强",
              "潜在转折空",
              "震荡市开空",
              "趋势潜在减弱",
              "趋势多且减弱",
              "不确定",
              "趋势多只平不开",
            ].includes(slowMarketType),
          position.slowMarketType === "震荡市开多" &&
            [
              "超买市",
              "趋势空且增强",
              "潜在转折空",
              "震荡市开空",
              "趋势潜在减弱",
              "趋势多且减弱",
              "不确定",
              "趋势多只平不开",
            ].includes(slowMarketType),
          position.slowMarketType === "潜在转折多" &&
            [
              "超买市",
              "趋势空且增强",
              "潜在转折空",
              "震荡市开空",
              "趋势潜在减弱",
              "趋势多且减弱",
              "不确定",
              "趋势多只平不开",
            ].includes(slowMarketType),
        ];

        const shortCloseConditions = [
          position.slowMarketType === "趋势空且增强" &&
            [
              "超卖市",
              "趋势多且增强",
              "潜在转折多",
              "震荡市开多",
              "趋势潜在增强",
              "趋势空且减弱",
              // '不确定',
              "趋势空只平不开",
              "趋势多",
            ].includes(slowMarketType),
          position.slowMarketType === "趋势潜在减弱" &&
            [
              "超卖市",
              "趋势多且增强",
              "潜在转折多",
              "震荡市开多",
              "趋势潜在增强",
              "趋势空且减弱",
              "不确定",
              "趋势空只平不开",
            ].includes(slowMarketType),
          position.slowMarketType === "震荡市开空" &&
            [
              "超卖市",
              "趋势多且增强",
              "潜在转折多",
              "震荡市开多",
              "趋势潜在增强",
              "趋势空且减弱",
              "不确定",
              "趋势空只平不开",
            ].includes(slowMarketType),
          position.slowMarketType === "潜在转折空" &&
            [
              "超卖市",
              "趋势多且增强",
              "潜在转折多",
              "震荡市开多",
              "趋势潜在增强",
              "趋势空且减弱",
              "不确定",
              "趋势空只平不开",
            ].includes(slowMarketType),
        ];

        const isReverse =
          // isProfitTarget ||
          // isStopLoss ||
          position.direction === "long"
            ? longCloseConditions.some((c) => !!c)
            : shortCloseConditions.some((c) => !!c);

        if (isReverse) {
          this.closePosition(position, d, fastMarketType, slowMarketType);
          position = null;
        }
      }

      // 处理开仓
      if (!position && signal.direction) {
        // console.log(
        // 	config.fastframe,
        // 	Object.assign(candle[config.fastframe], {
        // 		timestamp: moment(
        // 			candle[config.fastframe].timestamp
        // 		).format('YYYY-MM-DD HH:mm:ss'),
        // 	})
        // );
        // console.log(
        // 	config.slowframe,
        // 	Object.assign(candle[config.slowframe], {
        // 		timestamp: moment(
        // 			candle[config.slowframe].timestamp
        // 		).format('YYYY-MM-DD HH:mm:ss'),
        // 	})
        // );
        position = this.openPosition(
          d,
          d.atr,
          signal.direction,
          fastMarketType,
          slowMarketType
        );
      }
    });
  }

  async calculateATR(highs, lows, closes) {
    return new Promise((resolve) => {
      tulind.indicators.atr.indicator(
        [highs, lows, closes],
        [config.atrParam.atrPeriod],
        (err, res) => {
          resolve(res[0]);
        }
      );
    });
  }

  generateSignal(candle, secondKline5M, fastMarketType, slowMarketType) {
    // // 多头信号
    // if (
    // 	candle.close <= candle.middle &&
    // 	candle.emaSlope > config.emaSlope.emaSlopeThreshold
    // ) {
    // 	return { direction: 'long' };
    // }

    // // 空头信号
    // if (
    // 	candle.close >= candle.middle &&
    // 	candle.emaSlope < -config.emaSlope.emaSlopeThreshold
    // ) {
    // 	return { direction: 'short' };
    // }
    const longConditions = [
      slowMarketType === "趋势多且增强",
      slowMarketType === "趋势潜在增强",
      slowMarketType === "震荡市开多",
      slowMarketType === "潜在转折多",
    ];
    const shortConditions = [
      slowMarketType === "趋势空且增强",
      slowMarketType === "趋势潜在减弱",
      slowMarketType === "震荡市开空",
      slowMarketType === "潜在转折空",
    ];

    const longCondition = longConditions.some((condition) => !!condition);
    const shortCondition = shortConditions.some((condition) => !!condition);

    // 多头信号
    if (longCondition) {
      return {
        direction: "long",
        // direction: candle[config.slowframe].adx > 20 ? 'long' : 'short',
      };
    }

    // 空头信号
    if (shortCondition) {
      return {
        direction: "short",
        // direction: candle[config.slowframe].adx > 20 ? 'short' : 'long',
      };
    }

    return { direction: null };
  }

  openPosition(candle, atr, direction, fastMarketType, slowMarketType) {
    const positionSize = this.getPositionSize(candle.close, atr);
    const fee =
      positionSize * candle.close * (config.feeRate + config.slippage);

    const position = Object.assign(candle, {
      entryPrice: candle.close,
      entryTime: candle.timestamp,
      direction: direction,
      size: positionSize,
      takeProfit: atr * config.atrParam.takeProfit,
      stopLoss: atr * config.atrParam.stopLoss,
      fastMarketType,
      slowMarketType,
    });

    this.balance -= fee; // 扣除手续费
    this.totalFee += fee;
    // console.log(moment(candle.timestamp).format('YYYY-MM-DD HH:mm:ss'));
    // console.log(candle.close, candle.middle, candle.emaSlope);
    // console.log('direction', position.direction);
    // console.log('middle', candle.middle);
    // console.log('high', candle.high);
    // console.log('low', candle.low);
    return position;
  }

  getLnp(position, exitCandle) {
    const lnp = (exitCandle.close - position.entryPrice) / position.entryPrice;
    return position.direction === "long" ? lnp : -lnp;
  }

  closePosition(position, exitCandle, fastMarketType, slowMarketType) {
    const fee =
      position.size * exitCandle.close * (config.feeRate + config.slippage);
    const profit =
      position.direction === "long"
        ? (exitCandle.close - position.entryPrice) * position.size
        : (position.entryPrice - exitCandle.close) * position.size;

    this.balance += profit - fee;
    this.totalFee += fee;
    this.trades.push({
      size: position.size,
      direction: position.direction,
      entry: position.entryPrice,
      exit: exitCandle.close,
      profit: profit - fee,
      // fee,
      // entryMarketType: `${position.fastMarketType},${position.slowMarketType}`,
      // exitMarketType: `${fastMarketType},${slowMarketType}`,
      entryMarketType: `${position.slowMarketType}`,
      exitMarketType: `${slowMarketType}`,
      duration: `${Math.round(
        (exitCandle.timestamp - position.entryTime) / (1000 * 60 * 60)
      )}h`,
      entryTime: moment(position.entryTime).format("YYYY-MM-DD HH:mm:ss"),
      exitTime: moment(exitCandle.timestamp).format("YYYY-MM-DD HH:mm:ss"),
    });
  }

  showResults(startTime) {
    const wins = this.trades.filter((t) => t.profit > 0);
    const losses = this.trades.filter((t) => t.profit <= 0);

    const totalProfit = this.trades.reduce((sum, t) => sum + t.profit, 0);
    const winRate = ((wins.length / this.trades.length) * 100).toFixed(2);
    const profitFactor =
      wins.reduce((s, t) => s + t.profit, 0) /
      Math.abs(losses.reduce((s, t) => s + t.profit, 0));

    const profitTotal = this.balance - config.initialBalance;

    // console.log('\n最近20笔交易:');
    // console.table(this.trades);

    console.log(`
      ========== 回测结果 ==========
      总交易次数:     ${this.trades.length}
      胜率:          ${winRate}%
      总收益:        ${totalProfit.toFixed(2)} USDT
      期末余额:      ${this.balance.toFixed(2)} USDT
      盈亏比:        ${profitFactor.toFixed(2)}
      最大单笔盈利:  ${Math.max(...this.trades.map((t) => t.profit)).toFixed(2)}
      最大单笔亏损:  ${Math.min(...this.trades.map((t) => t.profit)).toFixed(2)}
      手续费:       ${this.totalFee}
      =============================
    `);
    console.log("profit:", profitTotal);
    console.log("startTime:", startTime.format("YYYY-MM-DD HH:mm:ss"));

    const profitMap = this.genEveryTypeProfit();
    Object.entries(profitMap).forEach(([key, value]) => {
      // console.log(`
      // ========== 交易类型: ${key} ==========
      // 总交易次数:     ${value.length}`);
      const typeProfit = value.reduce((sum, t) => sum + t, 0);
      console.log(
        key,
        "总交易次数:",
        value.length,
        "总收益:",
        typeProfit.toFixed(2)
      );
    });
  }

  genEveryTypeProfit() {
    const profitMap = new Map();
    this.trades.forEach((trade) => {
      const key = `${trade.entryMarketType}`;
      profitMap[key] = profitMap[key] || [];
      profitMap[key].push(trade.profit);
    });
    return profitMap;
  }
}

// 执行回测
(async () => {
  const backtester = new Backtester();
  const start = "2021-01-01";
  // const start = '2021-04-01';
  const end = "2025-04-10";
  const interval = 30;
  let profitTotal = 0;

  let i = 0;
  let startTime = moment(start).add(i, "days");
  while (moment(end).isAfter(startTime)) {
    // while (i === 0) {
    try {
      backtester.data = {
        [config.slowframe]: [],
        [config.fastframe]: [],
        merged: [],
      };
      backtester.trades = [];
      backtester.balance = config.initialBalance;
      backtester.totalFee = 0;

      // 步骤1: 加载历史数据
      const data = await backtester.loadHistoricalData(
        moment(start).add(i, "days").format("YYYY-MM-DD"),
        moment(start)
          .add(i + interval, "days")
          .format("YYYY-MM-DD"),
        interval
      );

      // 生成相关价格路径
      // const simPaths = backtester.generateCorrelatedPaths(data);
      // console.log(simPaths);

      // 步骤2: 计算指标
      await backtester.calculateIndicators();

      // console.log(
      // 	data[config.slowframe]
      // 		// .slice(-5)
      // 		.filter(
      // 			(item) =>
      // 				moment(item.timestamp).isAfter(
      // 					moment('2021-04-17 00:00:00')
      // 				) &&
      // 				moment(item.timestamp).isBefore(
      // 					moment('2021-04-17 03:00:00')
      // 				)
      // 		)
      // 		.map((candle) =>
      // 			Object.assign(candle, {
      // 				timestamp: moment(candle.timestamp).format(
      // 					'YYYY-MM-DD HH:mm:ss'
      // 				),
      // 			})
      // 		)
      // );

      // console.log(data[config.slowframe].length);

      // 步骤3: 运行回测
      backtester.runBacktest();

      // 步骤4: 显示结果
      backtester.showResults(startTime);

      profitTotal += backtester.balance - config.initialBalance;

      i += interval;

      startTime = moment(start).add(i, "days");
    } catch (e) {
      console.log(e);
    }
  }
  console.log("profitTotal", profitTotal);
})();

app.listen(8092);

console.log("8092 server start");

process.on("uncaughtException", function (e) {
  //打印出错误
  //   restart(e);
});

let exec = require("child_process").exec;
function restart(e) {
  console.log("restarting......", e);
  setTimeout(() => {
    exec("npm run restart", function (err, stdout, stderr) {
      if (err) {
        console.log("restarting failed");
      } else {
        console.log("restarting success");
      }
    });
  }, 1000 * 2);
}
function start() {
  console.log("starting......");
  setTimeout(() => {
    exec("npm run start", function (err, stdout, stderr) {
      if (err) {
        console.log("starting failed");
      } else {
        console.log("starting success");
      }
    });
  }, 1000 * 2);
}
function stop() {
  console.log("stopping......");
  setTimeout(() => {
    exec("npm run stop", function (err, stdout, stderr) {
      if (err) {
        console.log("stopping failed");
      } else {
        console.log("stopping success");
      }
      setTimeout(() => {
        start();
      }, 1000 * 60 * 60 * 24 * 1);
    });
  }, 1000 * 2);
}
