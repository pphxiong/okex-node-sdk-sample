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
const WebSocket = require("ws");
require("dotenv").config();

const MAX_TRADE_POSITION_RATIO = 7 / 10;
const LEVERAGE = 20;

// 配置参数
const config = {
  symbol: "DOGE/USDT",
  // timeframe: '1m',
  timeframes: ["1h", "15m", "5m" /* '1m'*/], // 多周期参数
  emaSettings: {
    "1h": { period: 2, slopeWindow: 2 },
    "15m": { period: 2, slopeWindow: 2 },
    "5m": { period: 2, slopeWindow: 2 },
  },
  slopeThreshold: {
    "1h": 0 * 0.01,
    "15m": 0 * 0.01,
    "5m": 0 * 0.01,
  }, // 斜率阈值
  slowframe: "1h",
  mediumframe: "15m",
  fastframe: "5m",
  // 布林线参数
  bollinger: {
    period: 20,
    stdDev: 1.8,
  },
  emaPeriods: [5, 20, 55], // 三EMA周期
  orderDepth: 0.00015, // 限价单挂单深度 (0.1%)
  tradeAmount: 100, // 每单交易金额(USDT)
  maxOrderAge: 1000 * 5, // 限价单最长存活时间(30秒)
  trailingStop: 0.0025, // 浮动止盈止损(0.25%)
  stopLoss: 0.01, // 硬止损(0.5%)
  takeProfit: 0.005, // 硬止盈(1%)
  coolingPeriod: 120, // 基础冷却时间(秒)
  numSegments: 5, // 分段数量
  icebergRatio: 0.2, // 冰山可见部分比例
  // BOLL参数
  bollPeriod: 14,
  bollStdDev: 3.0,
  // MACD参数
  macdFast: 8,
  macdSlow: 17,
  macdSignal: 5,
  coldStartBars: 1000, // 冷启动期间的K线数量
  atrParam: {
    // ATR参数
    atrPeriod: 14,
    stopLoss: 1.2,
    takeProfit: 1.8,
  },
};

// 全局状态
let state = {
  activeOrders: [], // 活跃限价单
  position: 0, // 当前持仓数量
  entryPrice: 0, // 持仓均价
  highestPrice: 0, // 持仓期间最高价
  lowestPrice: Infinity, // 持仓期间最低价
  side: "buy", // 交易方向
  coolingUntil: 0, // 基础冷却结束时间
};
let marketData = {
  [config.slowframe]: [],
  [config.mediumframe]: [],
  [config.fastframe]: [],
};
let ws = null;
let availableBalance = 0;
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
          [config.emaSettings[tf].period]
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
    });

    const result = await Promise.all(indicatorPromises);

    // 合并指标到数据
    config.timeframes.forEach((tf, index) => {
      const [ema, bollinger, atr] = result.slice(index * 3, index * 3 + 3);
      // 计算EMA斜率
      const emaSlopes = [];
      for (let i = config.emaSettings[tf].slopeWindow; i < ema[0].length; i++) {
        const slope =
          (ema[0][i] - ema[0][i - config.emaSettings[tf].slopeWindow]) /
          config.emaSettings[tf].slopeWindow;
        emaSlopes.push(slope);
      }
      console.log(tf, emaSlopes.slice(-5));
      // 合并指标到数据
      marketData[tf].forEach((d, i) => {
        if (i >= config.bollinger.period) {
          const bbIndex = i - config.bollinger.period;
          d.upper = bollinger[0][bbIndex];
          d.middle = bollinger[1][bbIndex];
          d.lower = bollinger[2][bbIndex];
        }
        if (i >= config.emaSettings[tf].slopeWindow) {
          const slopeIndex = i - config.emaSettings[tf].slopeWindow;
          d.emaSlope = emaSlopes[slopeIndex];
          d.ema = ema[0][slopeIndex];
        }
        d.atr = atr[0][i];
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

// EMA计算函数
async function calculateEMA(candles, period) {
  const formatCandles = candles.map(parseKLine);
  const closes = formatCandles.map((c) => c.close);
  return new Promise((resolve) => {
    tulind.indicators.ema.indicator([closes], [period], (err, results) => {
      resolve(results[0]);
    });
  });
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

// 限价单管理模块
class OrderManager {
  static async createLimitOrder(side, amount, price, isOpen = true) {
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
      amount,
      price,
      {
        positionSide,
      }
    );
    state.activeOrders.push({
      id: order.id,
      side,
      amount,
      price,
      timestamp: Date.now(),
    });
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
    if (Math.abs(state.position) >= config.tradeAmount / currentPrice) {
      for (const order of [...state.activeOrders]) {
        await this.cancelOrder(order.id);
      }
      state.activeOrders = [];
      return;
    }

    for (const order of [...state.activeOrders]) {
      // 处理超时订单
      if (Date.now() - order.timestamp > config.maxOrderAge) {
        await this.cancelOrder(order.id);
        console.log(`订单超时取消: ${order.id}`);
      }

      // 检查订单状态
      const status = await exchange.fetchOrder(order.id, config.symbol);

      if (status.filled > 0) {
        console.log(
          `订单部分成交: ${status.id} ${status.filled}/${status.amount}`
        );

        // 更新持仓
        const filledValue = status.filled * status.price;
        state.position +=
          status.side === "buy" ? status.filled : -status.filled;
        state.entryPrice =
          (state.entryPrice * state.position + filledValue) /
          (state.position + status.filled);
        state.side = status.side;

        // 移除完全成交订单
        if (status.remaining <= 0) {
          state.activeOrders = state.activeOrders.filter(
            (o) => o.id !== status.id
          );
        }
      }
    }
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
    const target = dataList.find((c) => c.timestamp === time.valueOf());
    if (target) {
      data = target;
      break;
    }
    i += 1;
  }
  return data;
}

// 交易信号生成
async function generateSignal(currentPrice) {
  const lastKline5M = JSON.parse(
    JSON.stringify(marketData[config.fastframe].slice(-1)[0])
  );
  const candle = {
    [config.slowframe]: getTimeStampBefore(
      marketData[config.slowframe],
      lastKline5M.timestamp
    ),
    [config.mediumframe]: getTimeStampBefore(
      marketData[config.mediumframe],
      lastKline5M.timestamp
    ),
    [config.fastframe]: lastKline5M,
  };

  if (
    !candle[config.slowframe].emaSlope ||
    !candle[config.mediumframe].emaSlope ||
    !candle[config.fastframe].emaSlope
  )
    return {};

  // 多头信号条件
  const longCondition =
    candle[config.slowframe].emaSlope >
      config.slopeThreshold[config.slowframe] &&
    candle[config.mediumframe].emaSlope >
      config.slopeThreshold[config.mediumframe] &&
    candle[config.fastframe].emaSlope > config.slopeThreshold[config.fastframe];

  // 空头信号条件
  const shortCondition =
    candle[config.slowframe].emaSlope <
      -config.slopeThreshold[config.slowframe] &&
    candle[config.mediumframe].emaSlope <
      -config.slopeThreshold[config.mediumframe] &&
    candle[config.fastframe].emaSlope <
      -config.slopeThreshold[config.fastframe];

  console.log("################################");
  console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
  console.log("currentPrice", currentPrice);
  console.log("position", state.position);
  console.log("side", state.side);
  console.log("longCondition", longCondition);
  console.log("shortCondition", shortCondition);
  console.log(
    config.fastframe,
    Object.assign(candle[config.fastframe], {
      timestamp: moment(candle[config.fastframe].timestamp).format(
        "YYYY-MM-DD HH:mm:ss"
      ),
    })
  );
  console.log(
    config.mediumframe,
    Object.assign(candle[config.mediumframe], {
      timestamp: moment(candle[config.mediumframe].timestamp).format(
        "YYYY-MM-DD HH:mm:ss"
      ),
    })
  );
  console.log(
    config.slowframe,
    Object.assign(candle[config.slowframe], {
      timestamp: moment(candle[config.slowframe].timestamp).format(
        "YYYY-MM-DD HH:mm:ss"
      ),
    })
  );
  console.log(marketData[config.slowframe].slice(-3));
  console.log("################################");

  return {
    buySignal: longCondition,
    sellSignal: shortCondition,
    price: currentPrice,
  };
}

// 风险管理模块
class RiskManager {
  static checkStopConditions(signal) {
    if (state.position === 0) return false;

    const lastKline5M = JSON.parse(
      JSON.stringify(marketData[config.fastframe].slice(-1)[0])
    );
    const candle = {
      [config.slowframe]: getTimeStampBefore(
        marketData[config.slowframe],
        lastKline5M.timestamp
      ),
      [config.mediumframe]: getTimeStampBefore(
        marketData[config.mediumframe],
        lastKline5M.timestamp
      ),
      [config.fastframe]: lastKline5M,
    };

    if (
      !candle[config.slowframe].emaSlope ||
      !candle[config.mediumframe].emaSlope ||
      !candle[config.fastframe].emaSlope
    )
      return false;

    const { price: currentPrice } = signal;
    const { side } = state;
    let isStop = false;

    isStop =
      side === "buy"
        ? candle[config.mediumframe].emaSlope <
          -config.slopeThreshold[config.mediumframe]
        : candle[config.mediumframe].emaSlope >
          config.slopeThreshold[config.mediumframe];

    console.log("***********************************");
    console.log("entryPrice", state.entryPrice);
    console.log("currentPrice", currentPrice);
    console.log("isStop", isStop);
    console.log("***********************************");
    return isStop;
  }

  static async closePosition(currentPrice, orderBook) {
    const side = state.position > 0 ? "sell" : "buy";
    const amount = Math.abs(state.position);

    console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
    console.log(
      `%c强制平仓 | 方向:${side} 数量:${amount} 均价:${state.entryPrice} 当前价:${currentPrice}`,
      "color: red; font-weight: bold;"
    );

    if (side === "buy") {
      const limitPrice = orderBook.bid * (1 - config.orderDepth);
      await OrderManager.createLimitOrder("buy", amount, limitPrice, false);
    }

    if (side === "sell") {
      const limitPrice = orderBook.ask * (1 + config.orderDepth);
      await OrderManager.createLimitOrder("sell", amount, limitPrice, false);
    }

    // await exchange.createOrder(
    // 	config.symbol,
    // 	'market',
    // 	side,
    // 	amount,
    // 	null,
    // 	{
    // 		positionSide: side === 'sell' ? 'LONG' : 'SHORT',
    // 	}
    // );

    // 重置状态
    state.position = 0;
    state.entryPrice = 0;
    state.highestPrice = 0;
    state.lowestPrice = 0;

    // this.activateCooldown();
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

  const [candlesSlow, candlesMedium, candlesFast] = await Promise.all(
    candlePromises
  );

  candlesSlow.pop();
  candlesMedium.pop();
  candlesFast.pop();

  marketData[config.slowframe] = candlesSlow.map(parseKLine);
  marketData[config.mediumframe] = candlesMedium.map(parseKLine);
  marketData[config.fastframe] = candlesFast.map(parseKLine);

  mergeTimeframes();

  console.log(
    `已加载${config.slowframe} ${marketData[config.slowframe].length}根历史K线`
  );
  console.log(
    `已加载${config.mediumframe} ${
      marketData[config.mediumframe].length
    }根历史K线`
  );
  console.log(
    `已加载${config.fastframe} ${marketData[config.fastframe].length}根历史K线`
  );
}

function getTradeAmount() {
  return config.tradeAmount;
}

// 策略主逻辑
async function strategyLoop() {
  try {
    // const currentPrice = candles[candles.length - 1][4];
    const ticker = await exchange.fetchTicker(config.symbol);
    const currentPrice = ticker.last;

    // 步骤1: 清理过期订单
    await OrderManager.checkOrderStatus(currentPrice);

    await calculateIndicators();

    // 步骤2: 获取信号
    const signal = await generateSignal(currentPrice);
    const orderBook = await getOrderBook();

    // 步骤3: 检查强制平仓
    if (RiskManager.checkStopConditions(signal)) {
      await RiskManager.closePosition(signal.price, orderBook);
      return;
    }

    // 步骤4: 生成限价单
    if (state.position === 0 && !RiskManager.isCoolingDown()) {
      if (signal.buySignal /* && orderBook.spread < orderBook.ask * 0.001 */) {
        const limitPrice = orderBook.bid * (1 - config.orderDepth);
        const amount = config.tradeAmount / limitPrice;

        await OrderManager.createLimitOrder("buy", amount, limitPrice);
        console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
        console.log(
          `%c挂买单 | 价格:${limitPrice} 数量:${amount}`,
          "color: red; font-weight: bold;"
        );
      }

      if (signal.sellSignal /* && orderBook.spread < orderBook.bid * 0.001 */) {
        const limitPrice = orderBook.ask * (1 + config.orderDepth);
        const amount = config.tradeAmount / limitPrice;

        await OrderManager.createLimitOrder("sell", amount, limitPrice);
        console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
        console.log(
          `%c挂卖单 | 价格:${limitPrice} 数量:${amount}`,
          "color: red; font-weight: bold;"
        );
      }
    }
  } catch (err) {
    console.log("time", moment().format("YYYY-MM-DD HH:mm:ss"));
    console.error("策略错误:", err.message);
    restart(err.message);
  }
}

async function initPositionData() {
  const positionResult = await cAuthClientBN.swap.getPosition();
  const { positions, availableBalance } = positionResult;
  if (positions) {
    const holding = positions.find(
      (item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
    );
    if (holding) {
      state = {
        activeOrders: [], // 活跃限价单
        position: Number(holding.positionAmt), // 当前持仓数量
        entryPrice: Number(holding.entryPrice), // 持仓均价
        highestPrice: Number(holding.entryPrice), // 持仓期间最高价
        lowestPrice: Number(holding.entryPrice), // 持仓期间最低价
        side: holding.positionSide === "LONG" ? "buy" : "sell",
      };
    }
  }
  return availableBalance;
}

// 实时数据订阅
function connectWebSocket() {
  const symbolForWS = config.symbol.replace("/", "").toLowerCase();
  const streams = [
    `${symbolForWS}@kline_${config.slowframe}`,
    `${symbolForWS}@kline_${config.mediumframe}`,
    `${symbolForWS}@kline_${config.fastframe}`,
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
        [`kline_${config.mediumframe}`]: config.mediumframe,
        [`kline_${config.fastframe}`]: config.fastframe,
      };

      if (!msg.data.k.x) return; // 仅处理闭合K线
      console.log("-----------------收到消息-----------------------");
      console.log(`更新: ${symbol} ${periodMap[period]} K线`);
      await handleKlineUpdate(msg.data, periodMap[period]);
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
  mergeTimeframes();
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
  availableBalance = await initPositionData();
  connectWebSocket();
  await strategyLoop();
  setInterval(async () => {
    RESTART_TIME += 1;
    if (RESTART_TIME >= 4 * 8) {
      RESTART_TIME = 0;
      restart("normal");
      return;
    }
    await strategyLoop();
  }, 1000 * 15); // 每15秒运行一次
  console.log("策略已启动...");
})();

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
