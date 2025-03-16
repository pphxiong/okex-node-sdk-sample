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
const { SMA, EMA, RSI, ATR } = require("technicalindicators");
// const Plotly = require('plotly')('username', 'api-key'); // 需注册获取凭证

class WaveBacktester {
  constructor() {
    this.exchange = new ccxt.binance();
    this.results = {
      trades: [],
      equityCurve: [10000], // 初始本金10000 USDT
      metrics: {},
    };
    this.candles = [];
  }

  async runBacktest(startDate, endDate) {
    try {
      // 1. 获取历史数据
      const candles = await this.fetchHistoricalData(startDate, endDate);
      this.candles = candles;

      // 2. 计算技术指标
      const indicators = await this.calculateIndicators(candles);

      // 3. 执行回测逻辑
      await this.executeBacktest(candles, indicators);

      // 4. 计算绩效指标
      this.calculateMetrics();

      // 5. 生成可视化报告
      // this.generateVisualization();

      return this.results;
    } catch (error) {
      console.error("回测执行失败:", error);
      process.exit(1);
    }
  }

  async fetchHistoricalData(start, end) {
    let allCandles = [];
    let since = new Date(start).getTime();
    const endTime = new Date(end).getTime();

    while (since < endTime) {
      const candles = await this.exchange.fetchOHLCV(
        "DOGE/USDT",
        "5m",
        since,
        1000
      );
      allCandles = allCandles.concat(candles);
      since = candles[candles.length - 1][0] + 1;

      // 防止请求过频
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return allCandles.map((c) => ({
      timestamp: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
  }

  async calculateIndicators(candles) {
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);

    return {
      ema20: await this.calculateEMA(closes, 20),
      atr14: await this.calculateATR(candles, 14),
      rsi14: this.calculateRSI(closes, 14),
      swingPoints: this.findSwingPoints(candles),
    };
  }

  async calculateEMA(prices, period) {
    return new Promise((resolve) => {
      tulind.indicators.ema.indicator([prices], [period], (err, results) => {
        resolve(results[0]);
      });
    });
  }

  async calculateATR(candles, period) {
    const input = {
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
      period,
    };
    return ATR.calculate(input);
  }

  calculateRSI(prices, period) {
    return RSI.calculate({ values: prices, period });
  }

  findSwingPoints(candles) {
    const swingPoints = { highs: [], lows: [] };

    for (let i = 2; i < candles.length - 2; i++) {
      const window = candles.slice(i - 2, i + 3);
      const center = window[2];

      if (
        center.high ===
        Math.max.apply(
          null,
          window.map((w) => w.high)
        )
      ) {
        swingPoints.highs.push({
          index: i,
          price: center.high,
          timestamp: center.timestamp,
        });
      }

      if (
        center.low ===
        Math.min.apply(
          null,
          window.map((w) => w.low)
        )
      ) {
        swingPoints.lows.push({
          index: i,
          price: center.low,
          timestamp: center.timestamp,
        });
      }
    }

    return swingPoints;
  }

  async executeBacktest(candles, indicators) {
    let position = null;
    let waveCount = 0;

    for (let i = 25; i < candles.length; i++) {
      // 前25根用于指标预热
      const currentCandle = candles[i];
      const currentIndicators = {
        ema20: indicators.ema20[i],
        atr14: indicators.atr14[i],
        rsi14: indicators.rsi14[i],
      };

      // 波浪状态检测
      const waveStatus = this.analyzeWave(
        indicators.swingPoints,
        currentCandle,
        i
      );

      // 生成交易信号
      const signal = this.generateSignal(
        waveStatus,
        currentIndicators,
        currentCandle,
        candles,
        i
      );

      // 执行交易
      if (signal.action !== "hold") {
        if (position) await this.closePosition(position, currentCandle);
        position = this.openPosition(signal, currentCandle);
      }

      // 更新权益曲线
      this.updateEquity(position, currentCandle);
    }
  }

  analyzeWave(swingPoints, candle, index) {
    const lastHighs = swingPoints.highs
      .filter((h) => h.index < index)
      .slice(-3);
    const lastLows = swingPoints.lows.filter((l) => l.index < index).slice(-3);

    return {
      isUpTrend:
        lastHighs.length >= 2 &&
        lastHighs[1].price > lastHighs[0].price &&
        lastLows[1].price > lastLows[0].price,
      isDownTrend:
        lastHighs.length >= 2 &&
        lastHighs[1].price < lastHighs[0].price &&
        lastLows[1].price < lastLows[0].price,
      waveCount: Math.max(
        this.countConsecutiveWaves(lastHighs, "asc"),
        this.countConsecutiveWaves(lastLows, "desc")
      ),
    };
  }

  countConsecutiveWaves(points, direction) {
    let count = 0;
    for (let i = 1; i < points.length; i++) {
      if (direction === "asc" && points[i].price > points[i - 1].price) count++;
      if (direction === "desc" && points[i].price < points[i - 1].price)
        count++;
    }
    return count;
  }

  generateSignal(waveStatus, indicators, candle, candles, i) {
    const volumeValid =
      candle.volume > this.calculateAverageVolume(candles.slice(i - 5, i));

    // 多头信号条件
    if (
      waveStatus.isUpTrend &&
      waveStatus.waveCount >= 2 &&
      candle.close > indicators.ema20 &&
      indicators.rsi14 > 50 &&
      volumeValid
    ) {
      return {
        action: "long",
        stopLoss: candle.low - indicators.atr14 * 1.5,
        takeProfit: candle.close + indicators.atr14 * 3,
      };
    }

    // 空头信号条件
    if (
      waveStatus.isDownTrend &&
      waveStatus.waveCount >= 2 &&
      candle.close < indicators.ema20 &&
      indicators.rsi14 < 50 &&
      volumeValid
    ) {
      return {
        action: "short",
        stopLoss: candle.high + indicators.atr14 * 1.5,
        takeProfit: candle.close - indicators.atr14 * 3,
      };
    }

    return { action: "hold" };
  }

  openPosition(signal, candle) {
    const position = {
      entryTime: candle.timestamp,
      entryPrice: candle.close,
      direction: signal.action,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      status: "open",
    };

    this.results.trades.push(position);
    return position;
  }

  async closePosition(position, exitCandle) {
    position.exitTime = exitCandle.timestamp;
    position.exitPrice = exitCandle.close;
    position.profit =
      position.direction === "long"
        ? (exitCandle.close - position.entryPrice) / position.entryPrice
        : (position.entryPrice - exitCandle.close) / position.entryPrice;
    position.status = "closed";

    // 扣除手续费和滑点
    position.netProfit = position.profit - 0.0007; // 0.07%手续费
    position.netProfit -= 0.0005; // 0.05%滑点
  }

  updateEquity(position, candle) {
    if (!position || position.status !== "open") return;

    // 检查止损/止盈
    if (
      (position.direction === "long" &&
        (candle.low <= position.stopLoss ||
          candle.high >= position.takeProfit)) ||
      (position.direction === "short" &&
        (candle.high >= position.stopLoss || candle.low <= position.takeProfit))
    ) {
      this.closePosition(position, candle);
    }

    // 更新权益曲线
    const currentEquity =
      this.results.equityCurve[this.results.equityCurve.length - 1];
    this.results.equityCurve.push(currentEquity * (1 + position.netProfit));
  }

  calculateMetrics() {
    const trades = this.results.trades.filter((t) => t.status === "closed");

    // 基础统计
    this.results.metrics = {
      totalTrades: trades.length,
      profitableTrades: trades.filter((t) => t.netProfit > 0).length,
      losingTrades: trades.filter((t) => t.netProfit <= 0).length,
      totalReturn: this.results.equityCurve.slice(-1)[0] / 10000 - 1,
      maxDrawdown: this.calculateMaxDrawdown(),
      sharpeRatio: this.calculateSharpeRatio(),
    };

    // 详细指标
    this.results.metrics.winRate =
      this.results.metrics.profitableTrades / this.results.metrics.totalTrades;
    this.results.metrics.avgProfit =
      trades.reduce((sum, t) => sum + t.netProfit, 0) / trades.length;
    this.results.metrics.profitFactor =
      trades
        .filter((t) => t.netProfit > 0)
        .reduce((sum, t) => sum + t.netProfit, 0) /
      Math.abs(
        trades
          .filter((t) => t.netProfit < 0)
          .reduce((sum, t) => sum + t.netProfit, 0)
      );
  }

  calculateMaxDrawdown() {
    let peak = this.results.equityCurve[0];
    let maxDD = 0;

    for (const equity of this.results.equityCurve) {
      if (equity > peak) peak = equity;
      const dd = (peak - equity) / peak;
      if (dd > maxDD) maxDD = dd;
    }

    return maxDD;
  }

  calculateSharpeRatio() {
    const returns = [];
    for (let i = 1; i < this.results.equityCurve.length; i++) {
      returns.push(
        this.results.equityCurve[i] / this.results.equityCurve[i - 1] - 1
      );
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.map((r) => Math.pow(r - avgReturn, 2)).reduce((a, b) => a + b) /
        returns.length
    );
    return (avgReturn / stdDev) * Math.sqrt(365 * 24 * 12); // 年化夏普比率
  }

  generateVisualization() {
    const equityTrace = {
      x: this.results.equityCurve.map((_, i) => i),
      y: this.results.equityCurve,
      type: "scatter",
      name: "Equity Curve",
    };

    const layout = {
      title: "策略资金曲线",
      xaxis: { title: "交易次数" },
      yaxis: { title: "净值(USDT)" },
    };

    // Plotly.plot('equity-chart', [equityTrace], layout);
  }
}

// 执行回测
const backtester = new WaveBacktester();
backtester.runBacktest("2024-01-01", "2024-01-30").then((results) => {
  console.log("回测结果:");
  console.table(results.metrics);
  console.log("详细交易记录:", results.trades);
});

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
