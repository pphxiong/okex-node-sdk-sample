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

// 配置参数
const SYMBOL = "DOGE/USDT:USDT"; // 币安永续合约
const TIMEFRAME = "1m";
const START_DATE = "2024-03-01T00:00:00Z";
const END_DATE = "2024-03-02T00:00:00Z";
const INITIAL_BALANCE = 1000; // 初始保证金（USDT）
const LEVERAGE = 10; // 杠杆倍数
const RISK_PER_TRADE = 0.02; // 单笔风险2%
const FEE_RATE = 0.0004; // Taker手续费0.04%

// 初始化交易所（合约）
const exchange = new ccxt.binanceusdm({
  enableRateLimit: true,
  options: { defaultType: "future" },
});

// 回测结果统计
let results = {
  totalTrades: 0,
  longWins: 0,
  shortWins: 0,
  totalProfit: 0,
  maxDrawdown: 0,
  winRate: 0,
  profitFactor: 0,
  trades: [],
};

// 获取历史数据
async function fetchHistoricalData() {
  let allOHLCV = [];
  let since = exchange.parse8601(START_DATE);
  const until = exchange.parse8601(END_DATE);

  while (since < until) {
    const ohlcv = await exchange.fetchOHLCV(SYMBOL, TIMEFRAME, since, 1000);
    if (ohlcv.length === 0) break;
    since = ohlcv[ohlcv.length - 1][0] + 1;
    allOHLCV = allOHLCV.concat(ohlcv);
  }
  return allOHLCV.map((c) => ({
    time: c[0],
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5],
  }));
}

// 检测波峰波谷（优化高频）
function findExtremes(data, window = 2) {
  const peaks = [],
    valleys = [];
  for (let i = window; i < data.length - window; i++) {
    const high = data[i].high;
    const low = data[i].low;
    let isPeak = true,
      isValley = true;
    for (let j = 1; j <= window; j++) {
      if (data[i - j].high >= high || data[i + j].high >= high) isPeak = false;
      if (data[i - j].low <= low || data[i + j].low <= low) isValley = false;
    }
    if (isPeak) peaks.push({ index: i, price: high });
    if (isValley) valleys.push({ index: i, price: low });
  }
  return { peaks, valleys };
}

// 计算动态支撑阻力
async function calculateLevels(data) {
  const closes = data.map((d) => d.close);
  const [ema20] = await tulind.indicators.ema.indicator([closes], [20]);
  const [bbUpper] = await tulind.indicators.bbands.indicator([closes], [20, 2]);
  return { ema20, bbUpper };
}

// 回测主逻辑
async function backtest() {
  const data = await fetchHistoricalData();
  if (data.length < 100) {
    console.log("数据不足");
    return;
  }

  let balance = INITIAL_BALANCE;
  let maxBalance = INITIAL_BALANCE;
  let position = null;

  for (let i = 20; i < data.length - 1; i++) {
    const currentData = data.slice(0, i + 1);
    const { peaks, valleys } = findExtremes(currentData);
    const { ema20, bbUpper } = await calculateLevels(currentData);

    // 静态关键位
    const resistance =
      peaks.slice(-3).reduce((a, p) => a + p.price, 0) / 3 || 0;
    const support = valleys.slice(-3).reduce((a, v) => a + v.price, 0) / 3 || 0;

    // 信号生成
    const current = data[i];
    const prev = data[i - 1];
    let signal = null;

    // 多单条件：突破阻力 + 放量 + 高于EMA20
    if (
      current.close > resistance &&
      // current.volume > prev.volume * 1.2 &&
      current.close > ema20[i - 20]
    ) {
      signal = "LONG";
    }
    // 空单条件：跌破支撑 + 放量 + 低于布林带上轨
    else if (
      current.close < support &&
      // current.volume > prev.volume * 1.2 &&
      current.close < bbUpper[i - 20]
    ) {
      signal = "SHORT";
    }

    // 开仓逻辑
    if (signal && !position) {
      const entryPrice = current.close;
      const stopLoss = signal === "LONG" ? support : resistance;
      const riskPerUnit = Math.abs(entryPrice - stopLoss);
      const positionSize = (balance * RISK_PER_TRADE * LEVERAGE) / riskPerUnit;

      position = {
        direction: signal,
        entryPrice,
        stopLoss,
        takeProfit:
          signal === "LONG"
            ? entryPrice + riskPerUnit * 2
            : entryPrice - riskPerUnit * 2,
        size: positionSize,
        entryTime: current.time,
      };
    }

    // 平仓逻辑（下一根K线）
    if (position) {
      const nextCandle = data[i + 1];
      console.log(
        i,
        current.close,
        nextCandle.low,
        nextCandle.high,
        position.direction,
        position.stopLoss,
        position.takeProfit,
        peaks.slice(-3),
        position
      );
      const isHitSL =
        (position.direction === "LONG" &&
          nextCandle.low <= position.stopLoss) ||
        (position.direction === "SHORT" &&
          nextCandle.high >= position.stopLoss);
      const isHitTP =
        (position.direction === "LONG" &&
          nextCandle.high >= position.takeProfit) ||
        (position.direction === "SHORT" &&
          nextCandle.low <= position.takeProfit);

      if (isHitSL || isHitTP) {
        const exitPrice = isHitSL ? position.stopLoss : position.takeProfit;
        const priceDiff = exitPrice - position.entryPrice;
        const profit =
          position.direction === "LONG"
            ? priceDiff * position.size
            : -priceDiff * position.size;
        const fee =
          position.size * position.entryPrice * FEE_RATE +
          position.size * exitPrice * FEE_RATE;
        const netProfit = profit - fee;

        balance += netProfit;
        maxBalance = Math.max(maxBalance, balance);
        const drawdown = ((maxBalance - balance) / maxBalance) * 100;
        results.maxDrawdown = Math.max(results.maxDrawdown, drawdown);

        results.trades.push({
          direction: position.direction,
          entry: position.entryPrice.toFixed(6),
          exit: exitPrice.toFixed(6),
          profit: netProfit.toFixed(2),
          time: moment(position.entryTime).format("YYYY-MM-DD HH:mm"),
        });

        results.totalTrades++;
        if (netProfit > 0) {
          position.direction === "LONG"
            ? results.longWins++
            : results.shortWins++;
        }
        results.totalProfit += netProfit;

        position = null;
      }
    }
  }

  // 统计结果
  results.winRate =
    ((results.longWins + results.shortWins) / results.totalTrades) * 100 || 0;
  results.profitFactor =
    results.totalProfit > 0
      ? (
          results.totalProfit /
          Math.abs(results.totalProfit - results.totalProfit * 2)
        ).toFixed(2)
      : 0;

  console.log("\n========== 合约回测结果 ==========");
  console.table({
    总交易次数: results.totalTrades,
    "多单胜率 (%)": ((results.longWins / results.totalTrades) * 100).toFixed(2),
    "空单胜率 (%)": ((results.shortWins / results.totalTrades) * 100).toFixed(
      2
    ),
    "总胜率 (%)": results.winRate.toFixed(2),
    "总收益 (USDT)": results.totalProfit.toFixed(2),
    收益风险比: results.profitFactor,
    "最大回撤 (%)": results.maxDrawdown.toFixed(2),
  });

  console.log("\n最近5笔交易:");
  console.table(results.trades.slice(-5));
}

backtest();

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
