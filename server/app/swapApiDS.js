import moment from "moment";
import helper from "../utils/index";
const customAuthClientBN = require("./customAuthClientBN");

const PASSWORD = "@Xiong092479";

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
const WebSocket = require("ws");
const fs = require("fs");
require("dotenv").config();

// const MAX_TRADE_POSITION_RATIO = 7 / 10;
// const LEVERAGE = 20;

// 配置参数
const config = {
  symbol: "DOGE/USDT",
  // timeframe: '1m',
  timeframes: ["3m", "5m", "15m" /*  '5m''1m'*/], // 多周期参数
  emaSettings: {
    // '30m': { periods: [10, 5], slopeWindow: 5 },
    // '15m': { periods: [12, 26, 50], slopeWindow: 5 },
    // '1m': { periods: [8, 21, 55], slopeWindow: 3 },
    // '3m': { periods: [5, 15, 30], slopeWindow: 3 },
    "3m": { periods: [8, 21, 55], slopeWindow: 3 },
    "5m": { periods: [8, 21, 55], slopeWindow: 3 },
    "15m": { periods: [8, 21, 55], slopeWindow: 3 },
    // '15m': { periods: [21, 55, 200], slopeWindow: 5 },
    // '15m': { periods: [8, 34, 144], slopeWindow: 5 },
    // '5m': { periods: [25, 5], slopeWindow: 5 },
  },
  macdParams: { "3m": [12, 26, 9], "5m": [12, 26, 9], "15m": [12, 26, 9] },
  fastframe: "3m",
  slowframe: "5m",
  trendframe: "15m",
  // 布林线参数
  bollinger: {
    period: 20,
    stdDev: 1.8,
  },
  orderDepth: 0.00012, // 限价单挂单深度 (0.1%)
  tradeAmount: 2400, // 每单交易金额(USDT)
  maxOrderAge: 1000 * 15 * 4, // 限价单最长存活时间(30秒)
  basicLnp: (0.01 * 2) / 3,
  profitStopLossRatio: 4, // 盈亏比
  trailingStop: 0.0025, // 浮动止盈止损(0.25%)
  stopLoss: 0.01, // 硬止损(0.5%)
  coolingPeriod: 180, // 基础冷却时间(秒)
  numSegments: 5, // 分段数量
  icebergRatio: 0.2, // 冰山可见部分比例
  // BOLL参数
  bollPeriod: 14,
  bollStdDev: 3.0,
  // MACD参数
  macdFast: 8,
  macdSlow: 17,
  macdSignal: 5,
  coldStartBars: 300, // 冷启动期间的K线数量
  atrParam: {
    // ATR参数
    atrPeriod: 14,
    stopLoss: 2.5,
    takeProfit: 2,
  },
  riskPerTrade: 0.02, // 每笔交易风险2%
  leverage: 40, // 杠杆倍数
  adxPeriod: 14,
  rsiPeriod: 14,
  // EMA斜率参数
  emaSlope: {
    period: 10,
    lookback: 5, // 计算5根K线斜率
    emaSlopeThreshold: 0.005 * 0.01, // EMA斜率阈值
    // emaSlopeThreshold: 0, // EMA斜率阈值
  },
  marketMode: 1,
  isMarketModeAuto: false,
  currentCandle: {},
  isPaused: false,
  signal: {},
  orderBook: {},
  lnpPercent: 0,
  maxLnpPercent: 0,
  minLnpPercent: 10000,
};
let intervalId = null;

function getMarketType(marketData) {
  const [fastSecondKline, fastLastKline] = JSON.parse(
    JSON.stringify(marketData[config.fastframe].slice(-2))
  );
  const [slowSecondKline, slowLastKline] = JSON.parse(
    JSON.stringify(marketData[config.slowframe].slice(-2))
  );
  const [trendSecondKline, trendLastKline] = JSON.parse(
    JSON.stringify(marketData[config.trendframe].slice(-2))
  );

  let marketType = "";
  if (!fastSecondKline) return marketType;
  if (!slowSecondKline) return marketType;
  if (!trendSecondKline) return marketType;

  const {
    close: trendClose,
    emaFast: trendEmaFast,
    emaSlow: trendEmaSlow,
    emaTrend: trendEmaTrend,
  } = trendLastKline;
  const {
    close: slowClose,
    emaFast: slowEmaFast,
    emaSlow: slowEmaSlow,
    emaTrend: slowEmaTrend,
  } = slowLastKline;
  const {
    close: fastClose,
    emaFast: fastEmaFast,
    emaSlow: fastEmaSlow,
    emaTrend: fastEmaTrend,
  } = fastLastKline;
  const {
    close: fastLastClose,
    emaFast: fastLastEmaFast,
    emaSlow: fastLastEmaSlow,
    emaTrend: fastLastEmaTrend,
  } = fastSecondKline;

  const longCondition =
    trendClose > trendEmaTrend &&
    // trendEmaFast > trendEmaSlow &&
    slowEmaFast > slowEmaSlow &&
    fastEmaFast > fastEmaSlow;
  // fastLastEmaFast < fastLastEmaSlow;

  const shortCondition =
    trendClose < trendEmaTrend &&
    // trendEmaFast < trendEmaSlow &&
    slowEmaFast < slowEmaSlow &&
    fastEmaFast < fastEmaSlow;
  // fastLastEmaFast > fastLastEmaSlow;

  const longCloseCondition = slowEmaFast < slowEmaSlow;
  const shortCloseCondition = slowEmaFast > slowEmaSlow;

  if (longCloseCondition) marketType = "趋势空";
  if (shortCloseCondition) marketType = "趋势多";
  if (longCondition) marketType = "趋势多且增强";
  if (shortCondition) marketType = "趋势空且增强";

  console.log("快速周期:", filterCandleData(fastLastKline));
  console.log("慢速周期:", filterCandleData(slowLastKline));
  console.log("趋势周期:", filterCandleData(trendLastKline));
  console.log("市场类型:", marketType);

  return marketType;
}

function filterCandleData(data) {
  const whiteList = [
    "timestamp",
    "open",
    "close",
    "emaFast",
    "emaSlow",
    "emaTrend",
  ];
  const target = {};
  whiteList.forEach((key) => {
    if (key === "timestamp") {
      target[key] = moment(data[key]).format("YYYY-MM-DD HH:mm:ss");
    } else {
      target[key] = data[key];
    }
  });
  return target;
}

const initState = {
  activeOrders: [], // 活跃限价单
  position: 0, // 当前持仓数量
  entryPrice: 0, // 持仓均价
  highestPrice: 0, // 持仓期间最高价
  lowestPrice: 10000, // 持仓期间最低价
  side: "buy", // 交易方向
  coolingUntil: 0, // 基础冷却结束时间
};

// 全局状态
let state = JSON.parse(JSON.stringify(initState));
let marketData = {
  [config.slowframe]: [],
  [config.fastframe]: [],
  [config.trendframe]: [],
};
let ws = null;
let globalAvailableBalance = 0;
let RESTART_TIME = 0;

// 初始化交易所
const exchange = new ccxt.binance({
  apiKey: configBN.httpkey,
  secret: configBN.httpsecret,
  options: {
    adjustForTimeDifference: true,
    defaultType: "future",
    hedgeMode: true,
  },
});

function findSwingPoints(candles) {
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

async function calculateAdx(highs, lows, closes) {
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

// 计算技术指标
async function calculateIndicators() {
  try {
    const indicatorPromises = [];

    config.timeframes.forEach(async (tf) => {
      // 计算布林带
      const closes = marketData[tf].map((d) => d.close);
      const highs = marketData[tf].map((d) => d.high);
      const lows = marketData[tf].map((d) => d.low);

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
        tulind.indicators.ema.indicator(
          [closes],
          [config.emaSettings[tf].periods[2]]
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

      indicatorPromises.push(calculateAdx(highs, lows, closes));

      indicatorPromises.push(
        tulind.indicators.rsi.indicator([closes], [config.rsiPeriod])
      );
    });

    const result = await Promise.all(indicatorPromises);

    const SMA = (list, key) => {
      const sum = list.reduce((acc, cur) => acc + cur[key], 0);
      return sum / list.length;
    };

    // 合并指标到数据
    config.timeframes.forEach((tf, index) => {
      const [
        emaFast,
        emaSlow,
        emaTrend,
        bollinger,
        atr,
        macd,
        [adx, adxPlusDI, adxMinusDI],
        rsi,
      ] = result.slice(index * 8, (index + 1) * 8);
      // 计算EMA斜率
      const emaFastSlopes = [];
      const emaSlowSlopes = [];
      const emaTrendSlopes = [];
      for (
        let i = config.emaSettings[tf].slopeWindow;
        i < emaFast[0].length;
        i++
      ) {
        const slope =
          (emaFast[0][i] - emaFast[0][i - config.emaSettings[tf].slopeWindow]) /
          emaFast[0][i - config.emaSettings[tf].slopeWindow];
        emaFastSlopes.push(slope);
      }
      for (
        let i = config.emaSettings[tf].slopeWindow;
        i < emaSlow[0].length;
        i++
      ) {
        const slope =
          (emaSlow[0][i] - emaSlow[0][i - config.emaSettings[tf].slopeWindow]) /
          emaSlow[0][i - config.emaSettings[tf].slopeWindow];
        emaSlowSlopes.push(slope);
      }
      for (
        let i = config.emaSettings[tf].slopeWindow;
        i < emaTrend[0].length;
        i++
      ) {
        const slope =
          (emaTrend[0][i] -
            emaTrend[0][i - config.emaSettings[tf].slopeWindow]) /
          emaTrend[0][i - config.emaSettings[tf].slopeWindow];
        emaTrendSlopes.push(slope);
      }

      // 合并指标到数据
      marketData[tf].forEach((d, i) => {
        if (i >= config.bollinger.period) {
          const bbIndex = i - config.bollinger.period + 1;
          d.upper = bollinger[0][bbIndex];
          d.middle = bollinger[1][bbIndex];
          d.lower = bollinger[2][bbIndex];
        }
        if (i >= config.emaSettings[tf].slopeWindow) {
          const slopeIndex = i - config.emaSettings[tf].slopeWindow;
          const zoomOut = 100000;
          d.emaFastSlope = emaFastSlopes[slopeIndex] * zoomOut;
          d.emaSlowSlope = emaSlowSlopes[slopeIndex] * zoomOut;
          d.emaTrendSlope = emaTrendSlopes[slopeIndex] * zoomOut;
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
          const adxIndex = i - config.adxPeriod * 2 + 2;
          const adxPlusDIIndex = i - config.adxPeriod + 1;

          d.adx = adx[adxIndex];
          d.adxPlusDI = adxPlusDI ? adxPlusDI[adxPlusDIIndex] : null;
          d.adxMinusDI = adxMinusDI ? adxMinusDI[adxPlusDIIndex] : null;
        }
        if (i >= config.rsiPeriod) {
          const rsiIndex = i - config.rsiPeriod;
          d.rsi = rsi[0][rsiIndex];
        }
        d.emaFast = emaFast[0][i];
        d.emaSlow = emaSlow[0][i];
        d.emaTrend = emaTrend[0][i];
        if (d.adx && d.atr) {
          // const isVolatility = d.adx > 30;
          const volatility_ratio = d.atr / d.emaSlow;
          const isVolatility = volatility_ratio > 0.01;
          d.rsi_long = isVolatility ? 48 : 58;
          d.rsi_short = isVolatility ? 58 : 48;
          d.stop_multiplier = isVolatility ? 3 : 2.5;
          d.adx_threshold = isVolatility ? 30 : 25;
          d.adx_stoploss_distance = isVolatility ? 5 : 3;
          d.volatility_ratio = volatility_ratio;
        }
        // d.marketType = getMarketType(
        // 	d,
        // 	marketData[tf][i - 1],
        // 	marketData[tf][i - 2]
        // );
        d.volumeAvg = SMA(marketData[tf].slice(i - 20, i + 1), "volume");
      });
    });
  } catch (e) {
    console.error("指标计算错误:", e);
  }
}

function parseKLine(data) {
  return {
    timestamp: data[0],
    open: parseFloat(data[1]),
    high: parseFloat(data[2]),
    low: parseFloat(data[3]),
    close: parseFloat(data[4]),
    volume: parseFloat(data[5]),
  };
}

// 获取订单簿深度
async function getOrderBook() {
  const ob = await exchange.fetchOrderBook(config.symbol);
  return {
    bid: ob.bids[0][0], // 最佳买价
    ask: ob.asks[0][0], // 最佳卖价
    spread: ob.asks[0][0] - ob.bids[0][0],
  };
}

function getLastIndicators(indicators, key) {
  return indicators[key][indicators[key].length - 1];
}

function getPositionSize() {
  // return (globalAvailableBalance * config.leverage * 1) / 3;
  // return Math.min(
  // 	globalAvailableBalance * config.leverage * 1 / 3,
  // 	config.tradeAmount
  // );
  return config.tradeAmount;
}

// 限价单管理模块
class OrderManager {
  static async createLimitOrder(
    side,
    amount,
    price,
    isOpen = true,
    singnal,
    lnp,
    kline
  ) {
    // const positionSize = isOpen ? getPositionSize() : amount;
    const positionSize = amount;
    const positionSide = isOpen
      ? side === "buy"
        ? "LONG"
        : "SHORT"
      : side === "buy"
      ? "SHORT"
      : "LONG";
    const order = await exchange.createLimitOrder(
      config.symbol,
      side,
      positionSize,
      price,
      {
        positionSide,
      }
    );
    const { fastMarketType, slowMarketType } = singnal;
    state.activeOrders.push({
      id: order.id,
      side,
      positionSize,
      isOpen,
      price,
      fastMarketType,
      slowMarketType,
      lnp,
      kline,
      timestamp: Date.now(),
    });
    await this.writeData();
    return order;
  }

  static async createMarketOrder(side, amount, price) {
    const order = await exchange.createOrder(
      config.symbol,
      "market",
      side,
      amount,
      null,
      {
        positionSide: side === "buy" ? "LONG" : "SHORT",
      }
    );
    state.activeOrders.push({
      id: order.id,
      side,
      amount,
      price: order.price,
      timestamp: Date.now(),
    });
    return order;
  }

  static async cancelOrder(orderId) {
    await exchange.cancelOrder(orderId, config.symbol);
    state.activeOrders = state.activeOrders.filter((o) => o.id !== orderId);
  }

  static async checkOrderStatus(currentPrice) {
    // if (Math.abs(state.position) >= config.tradeAmount / currentPrice) {
    //   for (const order of [...state.activeOrders]) {
    //     await this.cancelOrder(order.id);
    //   }
    //   state.activeOrders = [];
    //   return;
    // }

    for (const order of [...state.activeOrders]) {
      // 检查订单状态
      const status = await exchange.fetchOrder(order.id, config.symbol);

      // 处理超时订单
      if (
        Date.now() - order.timestamp > config.maxOrderAge &&
        status.remaining > 0
      ) {
        console.log(`订单超时取消: ${order.id}`);
        await this.cancelOrder(order.id);
      }

      if (status.filled > 0) {
        console.log(
          `订单部分成交: ${status.id} ${status.filled}/${status.amount}`
        );
        console.log(status);

        // 更新持仓
        if (
          !state.position ||
          Math.abs(state.position) < Math.abs(status.amount)
        ) {
          state.position = 0;
          state.entryPrice = 0;
          state.highestPrice = 0;
          const filledValue = status.filled * status.price;
          state.position +=
            status.side === "buy" ? status.filled : -status.filled;
          state.entryPrice =
            (state.entryPrice * state.position + filledValue) / state.position;
          state.side = status.side;
          state.fastMarketType = order.fastMarketType;
          state.slowMarketType = order.slowMarketType;
          state.marketMode = config.marketMode;
        } else {
          state.position = 0;
          state.entryPrice = 0;
          state.highestPrice = 0;
          state.lowestPrice = 0;

          if (config.isMarketModeAuto && false) {
            let { marketMode } = config;
            if (lnp) {
              if (marketMode == 1 && (lnp < -0.015 || lnp > 0.02)) {
                marketMode = 2;
              } else if (marketMode == 2 && lnp < -0.015) {
                marketMode = 1;
              }
            }
            config.marketMode = marketMode;
          }
        }

        // 移除完全成交订单
        if (status.remaining <= 0) {
          state.activeOrders = state.activeOrders.filter(
            (o) => o.id !== status.id
          );

          // if (order.isOpen === false) {
          //   config.isPaused = true;
          // } else {
          //   config.isPaused = false;
          // }

          // config.lnpPercent = 0;
          // config.maxLnpPercent = 0;
          // config.minLnpPercent = 10000;
        }

        this.writeData();
      }
    }
  }

  static async writeData() {
    let jsonStr = JSON.stringify(
      Object.assign(state, {
        marketMode: config.marketMode,
        isPaused: config.isPaused,
        tradeAmount: config.tradeAmount,
        profitStopLossRatio: config.profitStopLossRatio,
        isMarketModeAuto: config.isMarketModeAuto,
        maxLnpPercent: config.maxLnpPercent,
        minLnpPercent: config.minLnpPercent,
        lnpPercent: config.lnpPercent,
        writeMoment: moment().format("YYYY-MM-DD HH:mm:ss"),
      })
    );

    const result = await new Promise((resolve) => {
      //将修改后的内容写入文件
      fs.writeFile("./app/config.json", jsonStr, function (err) {
        if (err) {
          console.error(err);
        } else {
          console.log("----------文件修改成功-------------");
          console.log(jsonStr);
          resolve(true);
        }
      });
    });

    return result;
  }

  // 执行分段冰山订单
  static async executeSegmentedIcebergOrder() {
    const { side } = state;
    const {
      symbol,
      tradeAmount: totalAmount,
      numSegments,
      icebergRatio,
    } = config;
    const segmentAmount = totalAmount / numSegments;

    for (let i = 0; i < numSegments; i++) {
      try {
        // 获取最新价格
        const ticker = await exchange.fetchTicker(symbol);
        const price = ticker.last;

        // 计算冰山订单参数
        const visibleAmount = segmentAmount * icebergRatio;
        const icebergQty = visibleAmount.toFixed(6);

        // 创建冰山订单
        const order = await exchange.createOrder(
          symbol,
          "limit",
          side,
          segmentAmount,
          price,
          {
            icebergQty: icebergQty,
            timeInForce: "GTC",
            positionSide: side === "buy" ? "LONG" : "SHORT",
          }
        );

        console.log(`第 ${i + 1}/${numSegments} 段订单已执行:`, order.id);

        // 等待间隔（避免触发风控）
        await new Promise((resolve) => setTimeout(resolve, 3 * 1000));
      } catch (error) {
        console.error("订单创建失败:", error.message);
        break;
      }
    }
  }
}

function getHighsAndLows(indicators) {
  const lastHighs = indicators.swingPoints.highs
    .map((i) =>
      Object.assign(i, {
        timestamp: moment(i.timestamp).format("YYYY-MM-DD HH:mm:ss"),
      })
    )
    .slice(-2);
  const lastLows = indicators.swingPoints.lows
    .map((i) =>
      Object.assign(i, {
        timestamp: moment(i.timestamp).format("YYYY-MM-DD HH:mm:ss"),
      })
    )
    .slice(-2);

  const highest = Math.max.apply(
    null,
    lastHighs.map((h) => h.price)
  );
  const lowest = Math.min.apply(
    null,
    lastLows.map((h) => h.price)
  );
  const highLower = Math.min.apply(
    null,
    lastHighs.map((h) => h.price)
  );
  const lowHigher = Math.max.apply(
    null,
    lastLows.map((h) => h.price)
  );
  return { lastHighs, lastLows, highest, lowest, highLower, lowHigher };
}

function getTimeStampBefore(dataList, timestamp) {
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

function getTimeStampSlowBefore(dataList, timestamp) {
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

function toogleMarketType(marketType, candle) {
  const { adx, adx_threshold } = candle;
  if (config.marketMode == 2) {
    if (marketType.indexOf("多") != -1) {
      marketType = marketType.replace("多", "空");
    } else if (marketType.indexOf("空") != -1) {
      marketType = marketType.replace("空", "多");
    }
  }
  return marketType;
}

// 交易信号生成
async function generateSignal(currentPrice, isShowLog = false) {
  const [fastSecondKline, fastLastKline] = JSON.parse(
    JSON.stringify(marketData[config.fastframe].slice(-2))
  );
  const [slowSecondKline, slowLastKline] = JSON.parse(
    JSON.stringify(marketData[config.slowframe].slice(-2))
  );
  const candle = {
    [config.fastframe]: fastLastKline,
    [config.slowframe]: slowLastKline,
  };

  // 当 slowframe 与 fastframe 相同或未显式设置时，使用 fastframe 的最新K线
  if (!candle[config.slowframe]) {
    candle[config.slowframe] = candle[config.fastframe];
  }

  const { marketType: fastMarketType } = candle[config.fastframe];
  let { marketType: slowMarketType } = candle[config.slowframe];

  // slowMarketType = toogleMarketType(slowMarketType, candle[config.slowframe]);

  slowMarketType = getMarketType(marketData);

  config.currentCandle = Object.assign(candle[config.slowframe], {
    marketType: slowMarketType,
  });

  const longConditions = [
    slowMarketType.indexOf("趋势多且增强") !== -1,
    slowMarketType === "趋势潜在增强",
    slowMarketType === "震荡市开多",
    slowMarketType === "潜在转折多",
  ];
  const shortConditions = [
    slowMarketType.indexOf("趋势空且增强") !== -1,
    slowMarketType === "趋势潜在减弱",
    slowMarketType === "震荡市开空",
    slowMarketType === "潜在转折空",
  ];

  const longCondition = longConditions.some((condition) => !!condition);
  const shortCondition = shortConditions.some((condition) => !!condition);

  if (isShowLog) {
    console.log("################################");
    console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
    console.log("currentPrice", currentPrice);
    console.log("entryPrice", state.entryPrice);
    console.log("position", state.position);
    console.log("side", state.side);
    console.log("longCondition", longCondition);
    console.log("shortCondition", shortCondition);
    console.log("marketMode", config.marketMode);
    // console.log(
    // 	config.fastframe,
    // 	Object.assign(candle[config.fastframe], {
    // 		timestamp: moment(candle[config.fastframe].timestamp).format(
    // 			'YYYY-MM-DD HH:mm:ss'
    // 		),
    // 	})
    // );
    console.log(
      config.slowframe,
      Object.assign(candle[config.slowframe], {
        timestamp: moment(candle[config.slowframe].timestamp).format(
          "YYYY-MM-DD HH:mm:ss"
        ),
      })
    );
    // console.log(marketData[config.slowframe].slice(-3));
    console.log("marketType", slowMarketType);
    console.log("################################");
  }

  return {
    buySignal: longCondition,
    sellSignal: shortCondition,
    price: currentPrice,
    kline: slowLastKline,
    fastMarketType,
    slowMarketType,
  };
}

// 风险管理模块
class RiskManager {
  static checkStopConditions(signal) {
    const { side, position } = state;
    if (position === 0) return { isStop: false };

    const [fastSecondKline, fastLastKline] = JSON.parse(
      JSON.stringify(marketData[config.fastframe].slice(-2))
    );
    const [slowSecondKline, slowLastKline] = JSON.parse(
      JSON.stringify(marketData[config.slowframe].slice(-2))
    );

    const candle = {
      [config.fastframe]: fastLastKline,
      [config.slowframe]: slowLastKline,
    };

    const { marketType: fastMarketType } = candle[config.fastframe];
    let { marketType: slowMarketType } = candle[config.slowframe];

    // slowMarketType = toogleMarketType(
    // 	slowMarketType,
    // 	candle[config.slowframe]
    // );

    slowMarketType = getMarketType(marketData);

    const { price: currentPrice } = signal;
    let isStop = false;

    const d = candle[config.slowframe];

    const takeProfit = d.atr * config.atrParam.takeProfit;
    const stopLoss = d.atr * d.stop_multiplier;

    const lnp = getLnp(
      Math.abs(state.entryPrice),
      Math.abs(currentPrice),
      side === "buy" ? "sell" : "buy"
    );

    // const isProfitTarget =
    // 	side === 'buy'
    // 		? d.close >= state.entryPrice + takeProfit &&
    // 		  d.emaFast < d.emaSlow
    // 		: d.close <= state.entryPrice - takeProfit &&
    // 		  d.emaFast > d.emaSlow;

    // const isStopLoss =
    // 	side === 'buy'
    // 		? Math.abs(Number(d.close)) <=
    // 		  Math.abs(Number(state.entryPrice)) * (1 - 0.01)
    // 		: Math.abs(Number(d.close)) >=
    // 		  Math.abs(Number(state.entryPrice)) * (1 + 0.01);
    //  7 / 10 ; 3 / 10

    const { basicLnp, profitStopLossRatio, maxLnpPercent, minLnpPercent } =
      config;
    const amount = Math.abs(position) * currentPrice;
    const isProfitTarget = lnp > basicLnp * profitStopLossRatio;
    const isStopLoss = lnp < -basicLnp;
    let isProfitFirst =
      amount > (config.tradeAmount * 9) / 10 && lnp > basicLnp * 2;
    let isProfitSecond =
      amount > (config.tradeAmount * 5) / 10 && lnp > basicLnp * 4;
    let isLossFirst =
      amount > (config.tradeAmount * 7.5) / 10 && lnp < -basicLnp;
    let isLossSecond =
      amount > (config.tradeAmount * 3.5) / 10 && lnp < -basicLnp * 2;
    // if (config.marketMode == 2) {
    //   isProfitFirst =
    //     amount > (config.tradeAmount * 7.5) / 10 && lnp > basicLnp / 1.5;
    //   isProfitSecond =
    //     amount > (config.tradeAmount * 3.5) / 10 && lnp > basicLnp * 1;
    //   isLossFirst = amount > (config.tradeAmount * 9) / 10 && lnp < -basicLnp;
    //   isLossSecond =
    //     amount > (config.tradeAmount * 5) / 10 && lnp < -basicLnp * 2;
    // }

    // const takeProfit =
    //   lastKline5M[config.fastframe].atr * config.atrParam.takeProfit;
    // const stopLoss =
    //   lastKline5M[config.fastframe].atr * config.atrParam.stopLoss;

    // const isProfitTarget =
    //   side === "buy"
    //     ? lastKline5M[config.fastframe].close >=
    //       state.entryPrice + takeProfit
    //     : lastKline5M[config.fastframe].close <=
    //       state.entryPrice - takeProfit;

    if (!state.slowMarketType) {
      // state.slowMarketType = slowMarketType;
      state.slowMarketType = side === "buy" ? "趋势多且增强" : "趋势空且增强";
      // return { isStop: false, isStopLoss: false };
    }

    isStop =
      isProfitTarget ||
      isStopLoss ||
      (side === "buy"
        ? state.slowMarketType.indexOf("趋势多且增强") !== -1 &&
          slowMarketType.indexOf("趋势空") !== -1
        : state.slowMarketType.indexOf("趋势空且增强") !== -1 &&
          slowMarketType.indexOf("趋势多") !== -1);

    console.log("***********************************");
    console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
    console.log("entryPrice", state.entryPrice);
    console.log("position", state.position);
    console.log("currentPrice", currentPrice);
    // console.log('state.slowMarketType', state.slowMarketType);
    console.log("side", state.side);
    // if (side === 'buy') {
    // 	console.log(
    // 		'state.entryPrice - stopLoss',
    // 		state.entryPrice - stopLoss
    // 	);
    // } else {
    // 	console.log(
    // 		'state.entryPrice + stopLoss',
    // 		state.entryPrice + stopLoss
    // 	);
    // }
    // console.log('fastMarketType', fastMarketType);
    console.log("isStop", isStop);
    console.log("marketMode", config.marketMode);
    console.log(
      "adx",
      d.adx,
      "adx_threshold",
      d.adx_threshold,
      "adxPlusDI",
      d.adxPlusDI,
      "adxMinusDI",
      d.adxMinusDI
    );
    console.log(
      "lnp",
      lnp,
      "lnpPercent",
      (lnp * config.leverage * 100).toFixed(2) + "%",
      "maxLnpPercent",
      maxLnpPercent,
      "minLnpPercent",
      minLnpPercent
    );
    console.log("***********************************");
    const lnpPercent = lnp * config.leverage * 100;
    return {
      isStop,
      isStopLoss,
      isProfitFirst,
      isProfitSecond,
      lnpPercent,
      isLossFirst,
      isLossSecond,
    };
  }

  static async closePosition(
    singnal,
    orderBook,
    isStopLoss = false,
    isProfitFirst = false,
    isProfitSecond = false,
    isLossFirst = false,
    isLossSecond = false
  ) {
    const { price: currentPrice, kline } = singnal;
    const side = state.position > 0 ? "sell" : "buy";
    let amount = Math.abs(state.position);
    if (isProfitFirst) amount = (amount * 2) / 10;
    if (isLossFirst) amount = (amount * 5) / 10;
    if (isProfitSecond) amount = (amount * 6) / (10 - 2);
    if (isLossSecond) amount = (amount * 3) / (10 - 5);
    // if (config.marketMode == 2) {
    //   if (isLossFirst) amount = (amount * 2) / 10;
    //   if (isProfitFirst) amount = (amount * 5) / 10;
    //   if (isLossSecond) amount = (amount * 6) / (10 - 2);
    //   if (isProfitSecond) amount = (amount * 3) / (10 - 5);
    // }
    if (isLossFirst) amount = Math.abs(state.position);
    const lnp = getLnp(
      Math.abs(state.entryPrice),
      Math.abs(currentPrice),
      side
    );

    console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
    console.log(
      `%c强制平仓 | 方向:${side} 数量:${amount} 均价:${state.entryPrice} 当前价:${currentPrice}`,
      "color: red; font-weight: bold;"
    );

    if (isStopLoss) {
      await exchange.createOrder(config.symbol, "market", side, amount, null, {
        positionSide: side === "sell" ? "LONG" : "SHORT",
      });
      // 重置状态
      state.position = 0;
      state.entryPrice = 0;
      state.highestPrice = 0;
      state.lowestPrice = 0;
      state.lnpPercent = 0;
      state.maxLnpPercent = 0;
      state.minLnpPercent = 10000;

      const { basicLnp } = config;
      if (lnp < -basicLnp) {
        // config.isPaused = true;
      }
      await OrderManager.writeData();

      if (config.isMarketModeAuto) {
        config.marketMode = config.marketMode == 1 ? 2 : 1;
        await OrderManager.writeData();
      }

      // restart('market position closed...');

      return;
    }

    if (side === "buy") {
      const limitPrice = orderBook.bid * (1 - config.orderDepth);
      await OrderManager.createLimitOrder(
        "buy",
        amount,
        limitPrice,
        false,
        singnal,
        lnp,
        kline
      );
    }

    if (side === "sell") {
      const limitPrice = orderBook.ask * (1 + config.orderDepth);
      await OrderManager.createLimitOrder(
        "sell",
        amount,
        limitPrice,
        false,
        singnal,
        lnp,
        kline
      );
    }

    if (config.isMarketModeAuto && isLossFirst) {
      config.marketMode = config.marketMode == 1 ? 2 : 1;
      await OrderManager.writeData();
    }

    // this.activateCooldown();
    // config.isPaused = true;
    // await OrderManager.writeData();
  }

  static async getIsHasPosition() {
    const positionResult = await cAuthClientBN.swap.getPosition();
    const { positions } = positionResult;
    if (positions) {
      const holding = positions.find(
        (item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
      );
      return holding ? true : false;
    }
    return false;
  }

  static async openPosition(signal, orderBook) {
    const getIsHasPosition = await RiskManager.getIsHasPosition();
    if (getIsHasPosition) return;

    // 步骤4: 生成限价单
    if (state.position === 0 && !RiskManager.isCoolingDown()) {
      if (!signal.buySignal && !signal.sellSignal) {
        return;
      }
      config.lnpPercent = 0;
      config.maxLnpPercent = 0;
      config.minLnpPercent = 10000;

      const { slowMarketType } = signal;
      if (signal.buySignal /* && orderBook.spread < orderBook.ask * 0.001 */) {
        const limitPrice = orderBook.bid * (1 - config.orderDepth);
        const amount = getPositionSize(limitPrice) / limitPrice;

        state = JSON.parse(JSON.stringify(initState));
        state.slowMarketType = slowMarketType;

        await OrderManager.createLimitOrder(
          "buy",
          amount,
          limitPrice,
          true,
          signal
          // kline.atr
        );
        console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
        console.log(
          `%c挂买单 | 价格:${limitPrice} 数量:${amount}`,
          "color: red; font-weight: bold;"
        );
      }

      if (signal.sellSignal /* && orderBook.spread < orderBook.bid * 0.001 */) {
        const limitPrice = orderBook.ask * (1 + config.orderDepth);
        const amount = getPositionSize(limitPrice) / limitPrice;

        state = JSON.parse(JSON.stringify(initState));
        state.slowMarketType = slowMarketType;

        await OrderManager.createLimitOrder(
          "sell",
          amount,
          limitPrice,
          true,
          signal
          // kline.atr
        );
        console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
        console.log(
          `%c挂卖单 | 价格:${limitPrice} 数量:${amount}`,
          "color: red; font-weight: bold;"
        );
      }
    }
  }

  static activateCooldown() {
    const base = config.coolingPeriod;
    // const lossFactor = this.state.dailyMetrics.winRate < 0.5 ? 1.5 : 1;
    const lossFactor = 1;
    const cooldown = base * lossFactor * 1000;

    state.coolingUntil = Date.now() + cooldown;
    console.log(`交易冷却激活，持续时间：${cooldown / 1000}秒`);
  }

  static isCoolingDown() {
    return Date.now() < state.coolingUntil;
  }
}

// 初始化历史数据
async function initialize() {
  console.log("正在获取历史数据...");
  const candlePromises = [];
  config.timeframes.forEach((timeframe) => {
    candlePromises.push(
      exchange.fetchOHLCV(
        config.symbol,
        timeframe,
        undefined,
        config.coldStartBars
      )
    );
  });

  const [candlesFast, candlesSlow, candlesTrend] = await Promise.all(
    candlePromises
  );

  candlesFast.pop();
  candlesSlow.pop();
  candlesTrend.pop();

  marketData[config.fastframe] = candlesFast.map(parseKLine);
  marketData[config.slowframe] = candlesSlow.map(parseKLine);
  marketData[config.trendframe] = candlesTrend.map(parseKLine);

  // mergeTimeframes();

  // console.log(
  // 	`已加载${config.slowframe} ${
  // 		marketData[config.slowframe].length
  // 	}根历史K线`
  // );
  console.log(
    `已加载${config.fastframe} ${marketData[config.fastframe].length}根历史K线`
  );
  console.log(
    `已加载${config.slowframe} ${marketData[config.slowframe].length}根历史K线`
  );
  console.log(
    `已加载${config.trendframe} ${
      marketData[config.trendframe].length
    }根历史K线`
  );
}

function getLnp(entryPrice, close, side) {
  const lnp = (close - entryPrice) / entryPrice;
  return side === "sell" ? lnp : -lnp;
}

// 策略主逻辑
async function strategyLoop(isShowLog = false) {
  const { isPaused } = config;
  if (isPaused) {
    // if (intervalId) {
    // 	clearInterval(intervalId);
    // 	intervalId = null;
    // }
    return;
  }

  try {
    // const currentPrice = candles[candles.length - 1][4];
    const ticker = await exchange.fetchTicker(config.symbol);
    const currentPrice = ticker.last;

    // 步骤1: 清理过期订单
    await OrderManager.checkOrderStatus(currentPrice);

    await calculateIndicators();

    // 步骤2: 获取信号
    const signal = await generateSignal(currentPrice, isShowLog);
    const orderBook = await getOrderBook();
    config.signal = signal;
    config.orderBook = orderBook;

    // 步骤3: 检查强制平仓
    const {
      isStop,
      isStopLoss,
      isProfitFirst,
      isProfitSecond,
      lnpPercent,
      isLossFirst,
      isLossSecond,
    } = RiskManager.checkStopConditions(signal);
    let isStopReverse = false;
    config.lnpPercent = lnpPercent;
    if (lnpPercent > config.maxLnpPercent) {
      config.maxLnpPercent = lnpPercent;
      await OrderManager.writeData();
    }
    if (lnpPercent < config.minLnpPercent) {
      config.minLnpPercent = lnpPercent;
      await OrderManager.writeData();
    }
    const basicLnpPercent = config.basicLnp * config.leverage * 100;
    if (
      (Math.abs(config.maxLnpPercent) > basicLnpPercent / 1.5 &&
        Math.abs(config.maxLnpPercent) > Math.abs(config.minLnpPercent) &&
        Math.abs(config.maxLnpPercent) - Math.abs(lnpPercent) >
          basicLnpPercent / 1.5) ||
      (Math.abs(config.minLnpPercent) > basicLnpPercent / 1.5 &&
        Math.abs(config.maxLnpPercent) < Math.abs(config.minLnpPercent) &&
        Math.abs(config.minLnpPercent) - Math.abs(lnpPercent) >
          basicLnpPercent / 1.5)
    )
      isStopReverse = false;
    if (isStop || isStopReverse) {
      await RiskManager.closePosition(signal, orderBook, isStopLoss);
      return;
    }
    // else if (isProfitFirst || isProfitSecond || isLossFirst || isLossSecond) {
    // else if (isLossFirst) {
    // 	await RiskManager.closePosition(
    // 		signal,
    // 		orderBook,
    // 		isStopLoss,
    // 		isProfitFirst,
    // 		isProfitSecond,
    // 		isLossFirst,
    // 		isLossSecond
    // 	);
    // 	return;
    // }

    if (state.activeOrders.length > 0) {
      console.log("当前有未完成订单，跳过开仓检查");
      return;
    }
    await RiskManager.openPosition(signal, orderBook);
  } catch (err) {
    console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
    console.error("策略错误:", err.message);
    // if (config.isMarketModeAuto) {
    // 	config.marketMode = config.marketMode == 1 ? 2 : 1;
    // 	await OrderManager.writeData();
    // }
    restart(err.message);
  }
}

const readData = async () => {
  let dataConfig = JSON.parse(fs.readFileSync("./app/config.json", "utf-8"));

  const {
    position,
    entryPrice,
    isPaused,
    profitStopLossRatio,
    tradeAmount,
    maxLnpPercent,
    minLnpPercent,
    lnpPercent,
    activeOrders,
  } = dataConfig;

  // if (!config.isMarketModeAuto) {
  // 	delete dataConfig.marketMode;
  // }
  dataConfig = Object.assign(dataConfig, {
    position: Number(position),
    entryPrice: Number(entryPrice),
    isPaused,
    tradeAmount: tradeAmount ? Number(tradeAmount) : config.tradeAmount,
    profitStopLossRatio: profitStopLossRatio
      ? Number(profitStopLossRatio)
      : config.profitStopLossRatio,
    maxLnpPercent: maxLnpPercent ? Number(maxLnpPercent) : config.maxLnpPercent,
    minLnpPercent: minLnpPercent ? Number(minLnpPercent) : config.minLnpPercent,
    lnpPercent: lnpPercent ? Number(lnpPercent) : config.lnpPercent,
    activeOrders: activeOrders || [],
  });

  console.log("read::", dataConfig, moment().format("YYYY-MM-DD HH:mm:ss"));
  return dataConfig;
};

async function initPositionData() {
  const positionResult = await cAuthClientBN.swap.getPosition();
  const { positions, availableBalance, totalMarginBalance } = positionResult;
  const dataConfig = await readData();
  config.marketMode = dataConfig.marketMode || config.marketMode;
  config.isMarketModeAuto =
    dataConfig.isMarketModeAuto ||
    dataConfig.isMarketModeAuto === "true" ||
    config.isMarketModeAuto;
  config.isPaused =
    dataConfig.isPaused || dataConfig.isPaused === "true" || config.isPaused;
  config.profitStopLossRatio =
    dataConfig.profitStopLossRatio || config.profitStopLossRatio;
  config.tradeAmount = dataConfig.tradeAmount || config.tradeAmount;
  config.maxLnpPercent = dataConfig.maxLnpPercent || config.maxLnpPercent;
  config.minLnpPercent = dataConfig.minLnpPercent || config.minLnpPercent;
  config.lnpPercent = dataConfig.lnpPercent || config.lnpPercent;
  state.activeOrders = dataConfig.activeOrders || [];
  if (positions) {
    const holding = positions.find(
      (item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
    );
    if (holding) {
      state = {
        activeOrders: [], // 活跃限价单
        position: Number(holding.positionAmt), // 当前持仓数量
        entryPrice: Number(holding.entryPrice), // 持仓均价
        // highestPrice: Number(holding.entryPrice), // 持仓期间最高价
        // lowestPrice: Number(holding.entryPrice), // 持仓期间最低价
        side: holding.positionSide === "LONG" ? "buy" : "sell",
      };
      delete dataConfig.position;
      state = Object.assign(dataConfig, state);
      // if (config.isMarketModeAuto)
      // 	config.marketMode = state.marketMode || config.marketMode;
    }
  }
  return Number(totalMarginBalance);
}

// 实时数据订阅
function connectWebSocket() {
  const symbolForWS = config.symbol.replace("/", "").toLowerCase();
  const streams = [
    `${symbolForWS}@kline_${config.slowframe}`,
    `${symbolForWS}@kline_${config.fastframe}`,
    `${symbolForWS}@kline_${config.trendframe}`,
  ];
  // ws = new WebSocket(
  //   "wss://fstream.binance.com/ws/" + symbolForWS + "@kline_1m"
  // );
  ws = new WebSocket(
    `wss://stream.binance.com:9443/stream?streams=${streams.join("/")}`
  );

  ws.on("open", () => {
    console.log("WebSocket连接已建立");
  });

  ws.on("message", async (data) => {
    const msg = JSON.parse(data);
    if (msg.stream && msg.data) {
      const streamInfo = msg.stream.split("@");
      const [symbol, period] = streamInfo;
      const periodMap = {
        [`kline_${config.slowframe}`]: config.slowframe,
        [`kline_${config.fastframe}`]: config.fastframe,
        [`kline_${config.trendframe}`]: config.trendframe,
      };

      if (!msg.data.k.x) return; // 仅处理闭合K线
      console.log("-----------------收到消息-----------------------");
      console.log(`更新: ${symbol} ${periodMap[period]} K线`);
      if (periodMap[period] === config.fastframe) {
        await OrderManager.checkOrderStatus();
        restart("kline update");
      }

      // await handleKlineUpdate(msg.data, periodMap[period]);
      // await strategyLoop();
      //   console.log("-----------------------------------");
    }
  });

  ws.on("error", (err) => {
    console.error("WebSocket错误:", err);
  });
}

// 处理K线更新
async function handleKlineUpdate(msg, tf) {
  const kline = msg.k;
  if (!kline.x) return; // 仅处理闭合K线

  // 更新OHLCV数据
  const newBar = [
    kline.t, // 时间戳
    kline.o, // 开盘价
    kline.h, // 最高价
    kline.l, // 最低价
    kline.c, // 收盘价
    kline.v, // 成交量
  ];

  // 维护固定长度的数据窗口
  if (marketData[tf].length >= config.coldStartBars) {
    marketData[tf].shift();
  }
  marketData[tf].push(parseKLine(newBar));
  // mergeTimeframes();
}

// 多周期时间戳对齐
function mergeTimeframes() {
  const baseTimestamps = marketData[config.fastframe].map((c) => c.timestamp);

  config.timeframes.forEach((tf) => {
    if (tf === config.fastframe) return;
    marketData[tf] = marketData[tf].filter((c) =>
      baseTimestamps.includes(c.timestamp)
    );
  });
}

// 启动策略
(async () => {
  await exchange.loadMarkets();
  await initialize();
  globalAvailableBalance = await initPositionData();

  connectWebSocket();
  await strategyLoop(true);
  intervalId = setInterval(async () => {
    await strategyLoop(false);
    // RESTART_TIME += 1;
    // if (RESTART_TIME >= 3) {
    // 	RESTART_TIME = 0;
    // 	restart('normal');
    // 	return;
    // }
  }, config.maxOrderAge * 2);
  console.log("策略已启动...");
})();

function send(res, ret) {
  var str = JSON.stringify(ret);
  res.send(str);
}

app.get("/getMode", async function (req, res) {
  const { query = {} } = req;
  const { pw } = query;
  if (pw && pw.trim() === PASSWORD) {
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: {
        marketMode: config.marketMode,
        isPaused: config.isPaused,
        tradeAmount: config.tradeAmount,
        lnpPercent: config.lnpPercent,
        maxLnpPercent: config.maxLnpPercent,
        minLnpPercent: config.minLnpPercent,
        profitStopLossRatio: config.profitStopLossRatio,
        isMarketModeAuto: config.isMarketModeAuto,
        currentCandle: Object.assign(config.currentCandle, {
          timestamp: moment(config.currentCandle.timestamp).format(
            "YYYY-MM-DD HH:mm:ss"
          ),
        }),
      },
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/closePosition", async function (req, res) {
  const { query = {} } = req;
  const { pw } = query;
  if (pw && pw.trim() === PASSWORD) {
    const ticker = await exchange.fetchTicker(config.symbol);
    const currentPrice = ticker.last;

    // 步骤1: 清理过期订单
    await OrderManager.checkOrderStatus(currentPrice);
    await calculateIndicators();
    // 步骤2: 获取信号
    const signal = await generateSignal(currentPrice);
    const orderBook = await getOrderBook();
    await RiskManager.closePosition(signal, orderBook, true);
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: {},
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/openPosition", async function (req, res) {
  const { query = {} } = req;
  const { pw, side } = query;
  if (pw && pw.trim() === PASSWORD) {
    const ticker = await exchange.fetchTicker(config.symbol);
    const currentPrice = ticker.last;

    // 步骤1: 清理过期订单
    await OrderManager.checkOrderStatus(currentPrice);
    await calculateIndicators();
    // 步骤2: 获取信号
    // const signal = await generateSignal(currentPrice);
    let signal = null;
    if (side === "long") {
      signal = {
        buySignal: true,
        sellSignal: false,
        price: currentPrice,
        fastMarketType: "趋势多且增强",
        slowMarketType: "趋势多且增强",
      };
    } else if (side === "short") {
      signal = {
        buySignal: false,
        sellSignal: true,
        price: currentPrice,
        fastMarketType: "趋势空且增强",
        slowMarketType: "趋势空且增强",
      };
    }
    const orderBook = await getOrderBook();
    await RiskManager.openPosition(signal, orderBook, true);
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: {},
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/setProfitLossRatio", async function (req, res) {
  const { query = {} } = req;
  const { pw, ratio } = query;
  if (pw && pw.trim() === PASSWORD) {
    config.profitStopLossRatio = Number(ratio);
    await OrderManager.writeData();
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: { profitStopLossRatio: config.profitStopLossRatio },
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/setTradeAmount", async function (req, res) {
  const { query = {} } = req;
  const { pw, tradeAmount } = query;
  if (pw && pw.trim() === PASSWORD) {
    config.tradeAmount = Number(tradeAmount);
    await OrderManager.writeData();
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: { tradeAmount: config.tradeAmount },
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/closeLimitPosition", async function (req, res) {
  const { query = {} } = req;
  const { pw } = query;
  if (pw && pw.trim() === PASSWORD) {
    const ticker = await exchange.fetchTicker(config.symbol);
    const currentPrice = ticker.last;

    await calculateIndicators();
    // 步骤2: 获取信号
    const signal = await generateSignal(currentPrice);
    const orderBook = await getOrderBook();
    await RiskManager.closePosition(signal, orderBook);
    // config.isPaused = true;
    // await OrderManager.writeData();
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: {},
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/changeMode", async function (req, res) {
  const { query = {} } = req;
  const { pw } = query;
  if (pw && pw.trim() === PASSWORD) {
    config.marketMode = config.marketMode == 1 ? 2 : 1;
    state.marketMode = config.marketMode;
    config.isPaused = false;
    await OrderManager.writeData();
    // restart("change mode restart success...");
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: { marketMode: config.marketMode },
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/changeIsMarketModeAuto", async function (req, res) {
  const { query = {} } = req;
  const { pw } = query;
  if (pw && pw.trim() === PASSWORD) {
    config.isMarketModeAuto = !config.isMarketModeAuto;
    await OrderManager.writeData();
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: { isMarketModeAuto: config.isMarketModeAuto },
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/changeIsPaused", async function (req, res) {
  const { query = {} } = req;
  const { pw } = query;
  if (pw && pw.trim() === PASSWORD) {
    config.isPaused = !config.isPaused;
    await OrderManager.writeData();
    // restart("change isPaused restart success...");
    send(res, {
      errcode: 0,
      errmsg: "ok",
      data: { isPaused: config.isPaused },
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/restart", async function (req, res) {
  const { query = {} } = req;
  const { pw } = query;
  if (pw && pw.trim() === PASSWORD) {
    restart("api restart success...");
    send(res, {
      errcode: 0,
      errmsg: "ok",
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

app.get("/stop", async function (req, res) {
  const { query = {} } = req;
  const { pw } = query;
  if (pw && pw.trim() === PASSWORD) {
    stop("api stop success...");
    send(res, {
      errcode: 0,
      errmsg: "ok",
    });
  } else {
    send(res, { errcode: 1, errmsg: "password error" });
  }
});

// 获取最新信号与市场判断
// app.get('/signal', async function (req, res) {
// 	try {
// 		const ticker = await exchange.fetchTicker(config.symbol);
// 		const currentPrice = ticker.last;
// 		await calculateIndicators();
// 		const signal = await generateSignal(currentPrice, false);
// 		const outlook = signal.buySignal
// 			? '偏多'
// 			: signal.sellSignal
// 			? '偏空'
// 			: '中性/观望';
// 		send(res, {
// 			errcode: 0,
// 			errmsg: 'ok',
// 			data: {
// 				symbol: config.symbol,
// 				timeframe: config.fastframe,
// 				price: signal.price,
// 				buySignal: signal.buySignal,
// 				sellSignal: signal.sellSignal,
// 				fastMarketType: signal.fastMarketType,
// 				slowMarketType: signal.slowMarketType,
// 				outlook,
// 			},
// 		});
// 	} catch (e) {
// 		send(res, { errcode: 1, errmsg: e.message });
// 	}
// });

app.listen(8093);

console.log("8093 server start");

process.on("uncaughtException", function (e) {
  //打印出错误
  restart(e);
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
function stop(e) {
  console.log("stopping......", e);
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
