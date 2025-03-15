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
const { performance } = require("perf_hooks");

// #################### 策略配置 ####################
const STRATEGY_CONFIG = {
  symbol: "DOGE/USDT",
  timeframe: "1m", // K线周期
  warmupPeriod: 1000, // 预热K线数量(确保指标稳定)

  // EMA参数
  emaPeriods: {
    fast: 7,
    slow: 20,
  },

  // RSI参数
  rsiPeriod: 9,
  dispersionWindow: 50, // 离散度计算窗口

  // ATR参数
  atrPeriod: 14,

  // 交易规则
  entryRules: {
    emaSlopeThreshold: 0.0012, // EMA斜率阈值
    rsiDispersionBuy: -6, // RSI离散买入阈值
    atrVolatilityRatio: 1.5 / 100, // ATR波动率倍数
  },

  exitRules: {
    stopLossMultiplier: 1, // 止损ATR倍数
    takeProfitMultiplier: 1, // 止盈ATR倍数
    rsiDispersionSell: 8, // RSI离散卖出阈值
  },

  // 资金管理
  initialCapital: 1000, // 初始资金(USDT)
  riskPerTrade: 0.02, // 单笔风险比例
  feeRate: 0.0005, // 交易费率
  slippage: 0.0003, // 滑点率
};

// #################### 数据获取模块 ####################
class DataFetcher {
  constructor(config) {
    this.exchange = new ccxt.binance({ enableRateLimit: true });
    this.config = config;
  }

  async fetchHistoricalData(limit = 5000) {
    try {
      const since = this.exchange.milliseconds() - limit * 60 * 1000;
      const candles = await this.exchange.fetchOHLCV(
        this.config.symbol,
        this.config.timeframe,
        since,
        limit
      );

      return candles.map((c) => ({
        timestamp: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));
    } catch (error) {
      console.error("数据获取失败:", error.message);
      process.exit(1);
    }
  }
}

// #################### 指标计算引擎 ####################
class IndicatorEngine {
  constructor(config) {
    this.config = config;
    this.data = [];
  }

  async addNewCandle(candle) {
    this.currentCandle = candle;
    this.data.push(candle);
    if (this.data.length > this.config.warmupPeriod) {
      this.data.shift();
    }
    return this.calculateAllIndicators();
  }

  async calculateAllIndicators() {
    if (
      this.data.length <
      Math.max(
        this.config.emaPeriods.slow,
        this.config.rsiPeriod,
        this.config.atrPeriod
      )
    )
      return null;

    const closes = this.data.map((d) => d.close);
    const highs = this.data.map((d) => d.high);
    const lows = this.data.map((d) => d.low);

    // 并行计算指标
    const [emaFast, emaSlow, rsi, atr] = await Promise.all([
      this.calculateEMA(closes, this.config.emaPeriods.fast),
      this.calculateEMA(closes, this.config.emaPeriods.slow),
      this.calculateRSI(closes),
      this.calculateATR(highs, lows, closes),
    ]);

    // 计算EMA斜率
    const emaSlope = this.calculateEMASlope(emaFast);

    // 计算RSI离散度
    const rsiDispersion = this.calculateRSIDispersion(rsi);

    return {
      timestamp: this.currentCandle.timestamp,
      price: this.currentCandle.close,
      emaFast: emaFast[emaFast.length - 1],
      emaSlow: emaSlow[emaSlow.length - 1],
      emaSlope,
      rsi: rsi[rsi.length - 1],
      rsiDispersion,
      atr: atr[atr.length - 1],
    };
  }

  calculateEMASlope(emaValues) {
    if (emaValues.length < 3) return 0;
    const delta =
      emaValues[emaValues.length - 1] - emaValues[emaValues.length - 3];
    return delta / emaValues[emaValues.length - 3];
  }

  calculateRSIDispersion(rsiValues) {
    const window = rsiValues.slice(-this.config.dispersionWindow);
    const median = [...window].sort((a, b) => a - b)[
      Math.floor(window.length / 2)
    ];
    return rsiValues[rsiValues.length - 1] - median;
  }

  async calculateEMA(data, period) {
    return new Promise((resolve) => {
      tulind.indicators.ema.indicator([data], [period], (err, res) => {
        resolve(res[0]);
      });
    });
  }

  async calculateRSI(data) {
    return new Promise((resolve) => {
      tulind.indicators.rsi.indicator(
        [data],
        [this.config.rsiPeriod],
        (err, res) => {
          resolve(res[0]);
        }
      );
    });
  }

  async calculateATR(highs, lows, closes) {
    return new Promise((resolve) => {
      tulind.indicators.atr.indicator(
        [highs, lows, closes],
        [this.config.atrPeriod],
        (err, res) => {
          resolve(res[0]);
        }
      );
    });
  }
}

// #################### 策略核心逻辑 ####################
class TradingStrategy {
  constructor(config) {
    this.config = config;
    this.position = null;
  }

  getLatestHighAndLow(candles, period) {
    let high = 0;
    let low = Infinity;
    candles.slice(-period).forEach((candle) => {
      if (candle.close > high) {
        high = candle.high;
      }
      if (candle.close < low) {
        low = candle.low;
      }
    });
    return { high, low };
  }

  checkEntrySignal(indicators, candles) {
    const { high, low } = this.getLatestHighAndLow(candles, 10);
    const entryConditions = [
      indicators.price >= high,
      // indicators.emaSlope > this.config.entryRules.emaSlopeThreshold,
      //   indicators.rsiDispersion < this.config.entryRules.rsiDispersionBuy,
      //   indicators.atr >
      //     (indicators.price * this.config.entryRules.atrVolatilityRatio) / 100,
    ];
    return entryConditions.every((c) => c);
  }

  checkExitSignal(indicators) {
    if (!this.position) return false;

    const exitConditions = [
      indicators.price <= this.position.stopLoss,
      indicators.price >= this.position.takeProfit,
      //   indicators.rsiDispersion > this.config.exitRules.rsiDispersionSell,
    ];

    return exitConditions.some((c) => c);
  }

  calculatePositionSize(price, stopLoss) {
    const riskAmount = this.config.initialCapital * this.config.riskPerTrade;
    const stopLossDistance = price - stopLoss;
    return riskAmount / Math.abs(stopLossDistance);
  }
}

// #################### 回测引擎 ####################
class Backtester {
  constructor() {
    this.dataFetcher = new DataFetcher(STRATEGY_CONFIG);
    this.indicatorEngine = new IndicatorEngine(STRATEGY_CONFIG);
    this.strategy = new TradingStrategy(STRATEGY_CONFIG);
    this.equityCurve = [];

    this.state = {
      capital: STRATEGY_CONFIG.initialCapital,
      position: null,
      maxDrawdown: 0,
      peakCapital: STRATEGY_CONFIG.initialCapital,
    };
    this.candles = [];
    this.currentCandle = {};
    this.tradeHistory = [];
  }

  async executeBacktest() {
    console.log("开始回测...");
    const startTime = performance.now();

    // 获取历史数据
    const rawData = await this.dataFetcher.fetchHistoricalData();
    this.candles = rawData;
    // console.log(
    //   rawData.map((item) =>
    //     moment(item.timestamp).format("YYYY-MM-DD HH:mm:ss")
    //   )
    // );
    // 逐根K线回测
    for (const candle of rawData) {
      const indicators = await this.indicatorEngine.addNewCandle(candle);
      if (!indicators) continue; // 忽略预热期数据

      // 生成交易信号
      if (
        !this.state.position &&
        this.strategy.checkEntrySignal(indicators, this.candles)
      ) {
        console.log(
          "entrySignal",
          moment(indicators.timestamp).format("YYYY-MM-DD HH:mm:ss"),
          indicators
        );
        this.executeEntry(indicators);
      } else if (
        this.state.position &&
        this.strategy.checkExitSignal(indicators)
      ) {
        this.executeExit(indicators);
      }

      // 记录资金曲线
      this.recordEquity();
    }

    // 输出结果
    this.generateReport(performance.now() - startTime);
  }

  executeEntry(indicators) {
    const stopLoss = indicators.price * 0.99;
    // indicators.price -
    // indicators.atr * STRATEGY_CONFIG.exitRules.stopLossMultiplier;
    const takeProfit = indicators.price * 1.001;
    // indicators.price +
    // indicators.atr * STRATEGY_CONFIG.exitRules.takeProfitMultiplier;

    const positionSize =
      this.strategy.calculatePositionSize(indicators.price, stopLoss) / 10;

    // 扣除手续费和滑点
    const entryPrice = indicators.price * (1 + STRATEGY_CONFIG.slippage);
    const cost = positionSize * entryPrice * (1 + STRATEGY_CONFIG.feeRate);

    if (cost > this.state.capital) {
      console.log("资金不足");
      return; // 资金不足
    }

    this.state.position = {
      entryPrice,
      positionSize,
      stopLoss,
      takeProfit,
      entryTime: indicators.timestamp,
    };
    this.strategy.position = this.state.position;
    this.state.capital -= cost;
  }

  executeExit(indicators) {
    const exitPrice = indicators.price * (1 - STRATEGY_CONFIG.slippage);
    const proceeds =
      this.state.position.positionSize *
      exitPrice *
      (1 - STRATEGY_CONFIG.feeRate);

    this.state.capital += proceeds;

    // 记录交易
    this.tradeHistory.push({
      entry: this.state.position.entryPrice,
      exit: exitPrice,
      duration: indicators.timestamp - this.state.position.entryTime,
      pnl:
        proceeds -
        this.state.position.positionSize * this.state.position.entryPrice,
    });

    this.state.position = null;
    this.strategy.position = null;

    // 更新最大回撤
    if (this.state.capital > this.state.peakCapital) {
      this.state.peakCapital = this.state.capital;
    } else {
      const drawdown =
        (this.state.peakCapital - this.state.capital) / this.state.peakCapital;
      this.state.maxDrawdown = Math.max(this.state.maxDrawdown, drawdown);
    }
  }

  recordEquity() {
    this.equityCurve.push({
      timestamp: Date.now(),
      capital:
        this.state.capital +
        (this.state.position ? this.state.position.positionSize : 0) *
          this.indicatorEngine.currentCandle.close,
    });
  }

  generateReport(duration) {
    const profitableTrades = this.tradeHistory.filter((t) => t.pnl > 0).length;
    const winRate = profitableTrades / this.tradeHistory.length;

    const avgWin =
      this.tradeHistory
        .filter((t) => t.pnl > 0)
        .reduce((sum, t) => sum + t.pnl, 0) / profitableTrades;

    const avgLoss =
      this.tradeHistory
        .filter((t) => t.pnl <= 0)
        .reduce((sum, t) => sum + t.pnl, 0) /
      (this.tradeHistory.length - profitableTrades);

    console.log("\n======== 回测结果 ========");
    console.log(`总时长: ${(duration / 1000).toFixed(1)}秒`);
    console.log(`初始资金: $${STRATEGY_CONFIG.initialCapital}`);
    console.log(`最终资金: $${this.state.capital.toFixed(2)}`);
    console.log(
      `总收益率: ${(
        (this.state.capital / STRATEGY_CONFIG.initialCapital - 1) *
        100
      ).toFixed(2)}%`
    );
    console.log(`交易次数: ${this.tradeHistory.length}`);
    console.log(`胜率: ${(winRate * 100).toFixed(1)}%`);
    console.log(
      `平均盈利: $${avgWin.toFixed(2)} | 平均亏损: $${avgLoss.toFixed(2)}`
    );
    console.log(`盈亏比: ${(avgWin / Math.abs(avgLoss)).toFixed(2)}:1`);
    console.log(`最大回撤: ${(this.state.maxDrawdown * 100).toFixed(1)}%`);
    console.log("========================\n");
  }
}

// #################### 执行回测 ####################
(async () => {
  const backtester = new Backtester();
  await backtester.executeBacktest();
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
