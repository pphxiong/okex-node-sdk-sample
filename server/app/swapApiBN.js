import moment from "moment";
import helper from "../utils/index";

const { cloneDeep } = helper;

const fs = require("fs");

const customAuthClientBN = require("./customAuthClientBN");

const LEVERAGE = 5;
const INIT_ASSETS_RATIO = 12 / 20;

const EXCEED_HOLDING_NUM = 4;
const ATR_WIN_RATIO = 1.5;

const BTC_SYMBOL = "BTCUSDT";
const ETH_SYMBOL = "ETHUSDT";
const EOS_SYMBOL = "EOSUSDT";
const XRP_SYMBOL = "XRPUSDT";
const DOGE_SYMBOL = "DOGEUSDT";
const TRX_SYMBOL = "TRXUSDT";
const LTC_SYMBOL = "LTCUSDT";

const priceFixedMap = {
  [BTC_SYMBOL]: 1,
  [ETH_SYMBOL]: 2,
  [EOS_SYMBOL]: 3,
  [XRP_SYMBOL]: 4,
  [DOGE_SYMBOL]: 5,
  [TRX_SYMBOL]: 5,
  [LTC_SYMBOL]: 2,
};

const quantityFixedMap = {
  [BTC_SYMBOL]: 3,
  [ETH_SYMBOL]: 1,
  [EOS_SYMBOL]: 1,
  [XRP_SYMBOL]: 1,
  [DOGE_SYMBOL]: 0,
  [TRX_SYMBOL]: 0,
  [LTC_SYMBOL]: 1,
};

let ATR_PRICE_OBJ = {
  BTCUSDT_ATR: 0,
  ETHUSDT_ATR: 0,
  EOSUSDT_ATR: 0,
  XRPUSDT_ATR: 0,
  DOGEUSDT_ATR: 0,
  TRXUSDT_ATR: 0,
  LTCUSDT_ATR: 0,
};

const LOSS_MAX = (-LEVERAGE * 6.18) / 100;
const WIN_MAX = -LOSS_MAX;
let INIT_ASSETS = 12000;

const INIT_LONG_SHORT_ASSETS_RATIO = 1;
const MAX_OFFSET_RATIO = Math.abs(LOSS_MAX);

let RESTART_TIME = 0;
let MODE = 1;
const DEFAULT_INTERVAL = "30m";
const INIT_POSITION = 100;
let rsi1 = 8;
let rsi2 = 12;
let rsi3 = 24;

let maxWinRatio = 0;

const dealPositionBySymbol = async (
  symbol,
  direction,
  ratioSpace,
  isTradeContinouse,
  currentResult,
  lastResult
) => {
  const { maxSymbol, minSymbol } = currentResult;
  const { maxSymbol: maxSymbolLast, minSymbol: minSymbolLast } = lastResult;

  let mark_price;
  let currentHolding;
  let isHasClose = false;

  try {
    const { markPrice } = await cAuthClientBN.common.getMarkPrice(symbol);
    mark_price = Number(markPrice);
  } catch (e) {
    restart("getMarkPrice");
  }

  if (globalHolding.length) {
    // [currentHolding] = globalHolding;
    const currentLongHolding = globalHolding.find(
      (item) => item.positionSide.toUpperCase() === "LONG"
    );
    const currentShortHolding = globalHolding.find(
      (item) => item.positionSide.toUpperCase() === "SHORT"
    );
    currentHolding = currentLongHolding || currentShortHolding;
    if (currentHolding.positionSide.toUpperCase() !== direction.toUpperCase()) {
      let closePositionAmt = Math.abs(Number(currentHolding.positionAmt));
      const {
        positionAmt,
        positionSide,
        symbol: currentSymbol,
      } = currentHolding;
      const payload = {
        positionAmt,
        position: closePositionAmt,
        side: positionSide,
        positionSide,
        symbol: currentSymbol,
      };
      await closePosition(payload);
      isHasClose = true;
    }
  }
  const hasPositionCondition =
    false &&
    globalHolding.length &&
    !isTradeContinouse &&
    currentHolding.positionSide.toUpperCase() !== direction.toUpperCase();
  const noPositionCondition =
    !globalHolding.length &&
    (true ||
      !isTradeContinouse ||
      (false &&
        isTradeContinouse &&
        ((direction.toUpperCase() === "LONG" && minSymbol !== minSymbolLast) ||
          (direction.toUpperCase() === "SHORT" &&
            maxSymbol !== maxSymbolLast))));
  const openCondition = hasPositionCondition || noPositionCondition;
  if (openCondition) {
    let openPositionAmt = Number(
      ((INIT_ASSETS * LEVERAGE) / mark_price).toFixed(quantityFixedMap[symbol])
    );
    const params = {
      position: openPositionAmt,
      openSide: direction,
      mark_price,
      symbol,
    };
    // if (isHasClose) await waitTime(1000 * 2);
    await openPosition(params);
    await writeDataByRatioSpace(params, ratioSpace);
    // await waitTime(1000 * 3);
    // await fnCloseLimitOrderByRatio(params, ratioSpace);
  }
};

const fnCloseLimitOrderByRatio = async (params, ratioSpace) => {
  const { openSide = "long", position, mark_price, symbol } = params;
  const isLong = openSide.toUpperCase() == "LONG";
  const price = isLong
    ? mark_price * (1 + ratioSpace / 100)
    : mark_price * (1 - ratioSpace / 100);
  const side = isLong ? "SELL" : "BUY";
  const positionSide = isLong ? "LONG" : "SHORT";
  const payload = {
    price,
    symbol,
    side,
    positionSide,
    position: Number(position) / 1,
  };
  await closeLimitPosition(payload);
};

const fnGetConditionNum = (list) => {
  const numMap = { longNum: 0, shortNum: 0 };
  list.forEach(({ ratio }) => {
    const key = ratio >= 0 ? "longNum" : "shortNum";
    numMap[key] += 1;
  });
  return numMap;
};

const fnGetPositionAndDeal = async (currentResult, lastResult) => {
  const { maxSymbol, maxRatio, minSymbol, minRatio, symbolRatioList } =
    currentResult;
  const {
    maxRatio: maxRatioLast,
    minRatio: minRatioLast,
    maxSymbol: maxSymbolLast,
    minSymbol: minSymbolLast,
    symbolRatioList: symbolRatioListLast,
  } = lastResult;
  const { longNum, shortNum } = fnGetConditionNum(symbolRatioList);
  const { longNum: longNumLast, shortNum: shortNumLast } =
    fnGetConditionNum(symbolRatioListLast);
  const currentLongCondition = longNum > 3;
  const lastLongCondition = longNumLast > 3;
  const currentShortCondition = shortNum > 3;
  const lastShortCondition = shortNumLast > 3;

  let mark_price;
  try {
    const positionResult = await cAuthClientBN.swap.getPosition();
    const { positions: holding, availableBalance } = positionResult;
    globalHolding =
      holding.filter(
        (item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
      ) || [];
    if (globalHolding.length) {
      const [currentHolding] = globalHolding;
      INIT_ASSETS =
        Number(currentHolding.initialMargin) -
        Number(currentHolding.unrealizedProfit);
    } else {
      INIT_ASSETS = Number(availableBalance) * INIT_ASSETS_RATIO;
    }
  } catch (e) {
    restart("getPosition");
  }

  if (globalHolding.length) {
    const [currentHolding] = globalHolding;
    const { symbol } = currentHolding;
    try {
      const { markPrice } = await cAuthClientBN.common.getMarkPrice(symbol);
      mark_price = Number(markPrice);
    } catch (e) {
      restart("getMarkPrice");
    }
    const isLoss = fnGetIsLoss(currentHolding, mark_price) && false;
    if (isLoss) {
      let closePositionAmt = Math.abs(Number(currentHolding.positionAmt));
      const {
        positionAmt,
        positionSide,
        symbol: currentSymbol,
      } = currentHolding;
      const payload = {
        positionAmt,
        position: closePositionAmt,
        side: positionSide,
        positionSide,
        symbol: currentSymbol,
      };
      await closePosition(payload);
      // await waitTime(1000 * 2);
      globalHolding = [];
    }
  }

  const isTradeContinouse =
    (currentLongCondition && lastLongCondition) ||
    (currentShortCondition && lastShortCondition);

  const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");
  console.log("********************************************");
  console.log("********************************************");
  console.log("********************************************");
  console.log("currentTime", currentTime);
  console.log("********************************************");
  console.log("********************************************");
  console.log("********************************************");
  console.log("currentDirection", longNum, shortNum);
  console.log("lastDirection", longNumLast, shortNumLast);
  console.log("isTradeContinouse", isTradeContinouse);
  console.log(
    "maxSymbol",
    maxSymbol,
    "minSymbol",
    minSymbol,
    "maxSymbolLast",
    maxSymbolLast,
    "minSymbolLast",
    minSymbolLast,
    "longNum",
    longNum,
    "longNumLast",
    longNumLast
  );
  console.log("INIT_ASSETS", INIT_ASSETS);
  console.log("********************************************");

  // let ratioSpace = Math.max(Math.abs(maxRatio), Math.abs(minRatio));
  // const [{ symbol: queueSymbo, ratio: queueRatio }] =
  // 	symbolRatioList.splice(3, 1);
  // ratioSpace = Math.abs(ratioSpace - queueRatio) / 2;
  // const ratioSpace = Math.abs(Math.abs(maxRatio) - Math.abs(minRatio)) * 2;
  const ratioSpace = Math.abs(maxRatio - minRatio) / 2;
  if (!isTradeContinouse || true) {
    if (currentLongCondition) {
      dealPositionBySymbol(
        symbolRatioList[3].symbol,
        "long",
        ratioSpace,
        isTradeContinouse,
        currentResult,
        lastResult
      );
    } else if (currentShortCondition) {
      dealPositionBySymbol(
        symbolRatioList[3].symbol,
        "short",
        ratioSpace,
        isTradeContinouse,
        currentResult,
        lastResult
      );
    }
  }
};

const checkDealList = (symbolResultMap) => {
  const symbolRatioMap = {};
  let maxRatio = -Infinity;
  let minRatio = Infinity;
  let maxSymbol;
  let minSymbol;
  let currentTime;
  const symbolRatioList = [];
  Object.entries(symbolResultMap).forEach(([symbol, data]) => {
    const { macdList } = data;
    const open = macdList[macdList.length - 48].open;
    const close = macdList[macdList.length - 1].close;
    currentTime = macdList[macdList.length - 1].time;
    let ratio = ((Number(close) - Number(open)) * 100) / Number(open);
    ratio = toFixedAndToNumber(ratio, 2);
    symbolRatioList.push({ symbol, ratio });
    symbolRatioMap[symbol] = ratio;
    if (ratio > maxRatio) {
      maxRatio = ratio;
      maxSymbol = symbol;
    }
    if (ratio < minRatio) {
      minRatio = ratio;
      minSymbol = symbol;
    }
  });
  symbolRatioList.sort((a, b) => a.ratio - b.ratio);

  console.log("###############################################");
  // console.log('minSymbol', minSymbol, 'minRatio', minRatio);
  // console.log('maxSymbol', maxSymbol, 'maxRatio', maxRatio);
  // console.log('symbolRatioMap:::', symbolRatioMap);
  console.log("symbolRatioList:::");
  console.log(symbolRatioList);
  console.log("symbolTime", currentTime);
  console.log("###############################################");

  const result = {
    maxSymbol,
    maxRatio,
    minSymbol,
    minRatio,
    symbolRatioList,
  };
  return result;
};

const fnIsLastUpOrLow = (macdList, bollList) => {
  let isUp = false;
  let isLow = false;
  for (let i = macdList.length - 1; i > 0; i -= 1) {
    const isCurrentUp =
      macdList[i].close < bollList[i].UP &&
      macdList[i - 1].close > bollList[i - 1].UP &&
      macdList[i].close > bollList[i].MA;
    const isCurrentLow =
      macdList[i].close > bollList[i].DN &&
      macdList[i - 1].close < bollList[i - 1].DN &&
      macdList[i].close < bollList[i].MA;
    if (isCurrentUp) {
      isUp = true;
      break;
    }
    if (isCurrentLow) {
      isLow = true;
      break;
    }
  }
  return { isUp, isLow };
};

const fnIsCurrentContinousUpper = (macdList, i) => {
  return (
    macdList[i - 2].column > 0 &&
    // macdList[i].column > 0 &&
    macdList[i].column > macdList[i - 1].column &&
    macdList[i - 1].column > macdList[i - 2].column &&
    macdList[i].column > macdList[i + 1].column
  );
};

const fnIsCurrentContinousLower = (macdList, i) => {
  return (
    macdList[i - 2].column < 0 &&
    // macdList[i].column < 0 &&
    macdList[i].column < macdList[i - 1].column &&
    macdList[i - 1].column < macdList[i - 2].column &&
    macdList[i].column < macdList[i + 1].column
  );
};

const fnIsIntervalContinousUpper = (macdList, i) => {
  return (
    macdList[i - 1].column > 0 &&
    macdList[i].column > macdList[i - 1].column &&
    macdList[i - 1].column > macdList[i - 2].column &&
    macdList[i].column > macdList[i + 1].column
  );
};

const fnIsIntervalContinousLower = (macdList, i) => {
  return (
    macdList[i - 1].column < 0 &&
    macdList[i].column < macdList[i - 1].column &&
    macdList[i - 1].column < macdList[i - 2].column &&
    macdList[i].column < macdList[i + 1].column
  );
};

const fnGetIsUpperest = (macdList, i, j) => {
  let upperest = macdList[j].close;
  for (let k = i; k <= j; k += 1) {
    upperest = Math.max(upperest, macdList[k].close);
  }
  return upperest === macdList[j].close;
};

const fnGetIsLowerest = (macdList, i, j) => {
  let lowerest = macdList[j].close;
  for (let k = i; k <= j; k += 1) {
    lowerest = Math.min(lowerest, macdList[k].close);
  }
  return lowerest === macdList[j].close;
};

const fnGetIsHasIntervalUpper = (macdList, i, j) => {
  let is = false;
  for (let k = i; k < j; k += 1) {
    is =
      macdList[k].column > 0 &&
      macdList[k + 1].column > 0 &&
      macdList[k - 1].column > 0 &&
      macdList[k].column < macdList[k - 1].column &&
      macdList[k].column < macdList[k + 1].column;
  }
  return is;
};

const fnGetIsHasIntervalLower = (macdList, i, j) => {
  let is = false;
  for (let k = i; k < j; k += 1) {
    is =
      macdList[k].column < 0 &&
      macdList[k + 1].column < 0 &&
      macdList[k - 1].column < 0 &&
      macdList[k].column > macdList[k - 1].column &&
      macdList[k].column > macdList[k + 1].column;
  }
  return is;
};

const fnGetIsContinousHigh = (macdList, i) => {
  const is =
    macdList[i].column > macdList[i - 1].column &&
    macdList[i - 1].column > macdList[i - 2].column &&
    macdList[i].column > macdList[i + 1].column;
  return is;
};

const fnGetIsContinousLow = (macdList, i, j) => {
  let is =
    macdList[i].column < macdList[i - 1].column &&
    macdList[i - 1].column < macdList[i - 2].column &&
    macdList[i].column < macdList[i + 1].column;
  return is;
};

const fnGetIsHoldingExceed = (holding, direction) => {
  const filterHolding = holding.filter(
    (item) =>
      item.positionSide &&
      item.positionSide.toUpperCase() == direction.toUpperCase() &&
      Math.abs(Number(item.positionAmt)) > 0
  );

  return filterHolding.length >= EXCEED_HOLDING_NUM;
};

const fnGetIsHasIntervalUpperReverse = (macdList, i, j) => {
  let is = false;
  for (let k = i + 5; k < j - 5; k += 1) {
    is =
      fnIsUpperReverse(macdList, i, k) &&
      fnIsUpperReverse(macdList, k, j) &&
      fnIsUpperReverse(macdList, i, j) &&
      fnIsIntervalContinousUpper(macdList, k);
    // && fnGetIsHasIntervalMacdLow(macdList, k, j);
    if (is) {
      console.log("############fnGetIsHasIntervalUpperReverse############");
      console.log(
        "i",
        i,
        macdList
          .slice(i, i + 1)
          .map(({ column, open, close, high, low, time }) => ({
            column,
            open,
            close,
            high,
            low,
            time,
          })),
        "k",
        k,
        macdList
          .slice(k, k + 1)
          .map(({ column, open, close, high, low, time }) => ({
            column,
            open,
            close,
            high,
            low,
            time,
          })),
        "j",
        j,
        macdList
          .slice(j, j + 1)
          .map(({ column, open, close, high, low, time }) => ({
            column,
            open,
            close,
            high,
            low,
            time,
          }))
      );
      console.log("########################");
      break;
    }
  }
  return is;
};

const fnGetIsHasIntervalLowerReverse = (macdList, i, j) => {
  let is = false;
  for (let k = i + 5; k < j - 5; k += 1) {
    is =
      fnIsLowerReverse(macdList, i, k) &&
      fnIsLowerReverse(macdList, k, j) &&
      fnIsLowerReverse(macdList, i, j) &&
      fnIsIntervalContinousLower(macdList, k);
    // && fnGetIsHasIntervalMacdHigh(macdList, k, j);
    if (is) {
      console.log("############fnGetIsHasIntervalLowerReverse############");
      console.log(
        "i",
        i,
        macdList
          .slice(i, i + 1)
          .map(({ column, open, close, high, low, time }) => ({
            column,
            open,
            close,
            high,
            low,
            time,
          })),
        "k",
        k,
        macdList
          .slice(k, k + 1)
          .map(({ column, open, close, high, low, time }) => ({
            column,
            open,
            close,
            high,
            low,
            time,
          })),
        "j",
        j,
        macdList
          .slice(j, j + 1)
          .map(({ column, open, close, high, low, time }) => ({
            column,
            open,
            close,
            high,
            low,
            time,
          }))
      );
      console.log("########################");
      break;
    }
  }
  return is;
};

const fnGetIsHasIntervalMacdLow = (macdList, i, j) => {
  let is = false;
  for (let k = i + 1; k < j; k += 1) {
    is = macdList[k].column <= 0;
    if (is) break;
  }
  return is;
};

const fnGetIsHasIntervalMacdHigh = (macdList, i, j) => {
  let is = false;
  for (let k = i + 1; k < j; k += 1) {
    is = macdList[k].column >= 0;
    if (is) break;
  }
  return is;
};

const fnIsLowerReverse = (macdList, i, j) => {
  // const differ = Math.abs(macdList[i].column - macdList[j].column);
  const isLowerReverse =
    (macdList[j].low <= macdList[i].low ||
      macdList[j].close <= macdList[i].close) &&
    macdList[j].column > macdList[i].column;
  // && differ > ATR / 240;
  const isExtraReverse =
    macdList[j].close >= macdList[i].close &&
    macdList[j].column < macdList[i].column;
  return isLowerReverse;
};

const fnIsUpperReverse = (macdList, i, j) => {
  // const differ = Math.abs(macdList[i].column - macdList[j].column);
  const isUpperReverse =
    (macdList[j].high >= macdList[i].high ||
      macdList[j].close >= macdList[i].close) &&
    macdList[j].column < macdList[i].column;
  // && differ > ATR / 240;
  const isExtraReverse =
    macdList[j].close <= macdList[i].close &&
    macdList[j].column > macdList[i].column;
  return isUpperReverse;
};

const fnIsMacdReverse = (macdList, atrList, symbol) => {
  const ATR = atrList[atrList.length - 1];

  const isUpper =
    macdList[macdList.length - 1].column > macdList[macdList.length - 2].column;
  const isLower =
    macdList[macdList.length - 1].column < macdList[macdList.length - 2].column;

  const isLatestContinousUpper = fnIsCurrentContinousUpper(
    macdList,
    macdList.length - 2
  );
  const isLatestContinousLower = fnIsCurrentContinousLower(
    macdList,
    macdList.length - 2
  );
  let isUpperReverse = false;
  let isLowerReverse = false;
  if (isLower) {
    if (isLatestContinousUpper) {
      console.log("#############################################");
      console.log("symbol", symbol);
      console.log("isLatestContinousUpper", true);
      console.log(
        "macd",
        macdList.slice(-1).map(({ column, open, close, time }) => ({
          column,
          open,
          close,
          time,
        }))
      );
      console.log("#############################################");
      for (let i = macdList.length - 3; i > macdList.length - 72; i -= 1) {
        const isCurrentContinousUpper = fnIsCurrentContinousUpper(macdList, i);
        const isStartEndReverse = fnIsUpperReverse(
          macdList,
          i,
          macdList.length - 2
        );
        if (isCurrentContinousUpper && isStartEndReverse) {
          isUpperReverse =
            fnGetIsHasIntervalUpperReverse(macdList, i, macdList.length - 2) &&
            i + 10 < macdList.length - 2;
          if (isUpperReverse) break;
        }
      }
    }
  } else if (isUpper) {
    if (isLatestContinousLower) {
      console.log("#############################################");
      console.log("symbol", symbol);
      console.log("isLatestContinousLower", true);
      console.log(
        "macd",
        macdList.slice(-1).map(({ column, open, close, time }) => ({
          column,
          open,
          close,
          time,
        }))
      );
      console.log("#############################################");
      for (let i = macdList.length - 3; i > macdList.length - 72; i -= 1) {
        const isCurrentContinousLower = fnIsCurrentContinousLower(macdList, i);
        const isStartEndReverse = fnIsLowerReverse(
          macdList,
          i,
          macdList.length - 2
        );
        if (isCurrentContinousLower && isStartEndReverse) {
          isLowerReverse =
            fnGetIsHasIntervalLowerReverse(macdList, i, macdList.length - 2) &&
            fnGetIsHasIntervalMacdHigh(macdList, i, macdList.length - 2) &&
            i + 10 < macdList.length - 2;
          if (isLowerReverse) break;
        }
      }
    }
  }
  return { isUpperReverse, isLowerReverse };
};

const fnGetIsLoss = (holding, mark_price) => {
  const { positionSide, entryPrice, symbol } = holding;
  const key = symbol + "_ATR";
  const isLong = positionSide.toUpperCase() === "LONG";
  const lossPrice = isLong
    ? Number(entryPrice) - Number(ATR_PRICE_OBJ[key])
    : Number(entryPrice) + Number(ATR_PRICE_OBJ[key]);
  const isLoss = isLong
    ? Number(mark_price) < lossPrice
    : Number(mark_price) > lossPrice;
  // console.log(key, lossPrice, mark_price, isLoss, Number(ATR_PRICE_OBJ[key]));
  return Number(ATR_PRICE_OBJ[key]) && isLoss;
};

async function checkByStep(data, symbol) {
  const { macdList, bollList, atrList } = data;
  let mark_price;
  try {
    const data = await cAuthClientBN.common.getMarkPrice(symbol);
    mark_price = Number(data.markPrice);
  } catch (e) {
    restart("getMarkPrice");
  }

  let longHolding;
  let shortHolding;
  let longRatio = 0;
  let shortRatio = 0;
  let avail = 0;

  if (positionChange || !globalHolding || !globalHolding.length || true) {
    try {
      const positionResult = await cAuthClientBN.swap.getPosition();
      const { positions: holding, availableBalance } = positionResult;

      globalHolding =
        holding.filter(
          (item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
        ) || [];
      positionChange = false;
      const currentTotalAsset = globalHolding
        .map((item) => Number(item.isolatedWallet))
        .reduce((pre, cur) => pre + cur, 0);
      // const unrealizedProfitTotal = globalHolding
      // 	.map((item) => Number(item.unrealizedProfit))
      // 	.reduce((pre, cur) => pre + cur, 0);
      const COMPUTED_INIT_ASSETS =
        (Number(availableBalance) + Number(currentTotalAsset)) *
        INIT_ASSETS_RATIO;
      INIT_ASSETS = Math.min(
        INIT_ASSETS,
        COMPUTED_INIT_ASSETS,
        Number(availableBalance)
      );
      // console.log(
      // 	'availableBalance',
      // 	availableBalance,
      // 	'currentTotalAsset',
      // 	currentTotalAsset,
      // 	'INIT_ASSETS',
      // 	INIT_ASSETS
      // );

      // if (longHolding) {
      // 	INIT_ASSETS =
      // 		(Math.abs(Number(longHolding.positionAmt)) * mark_price) /
      // 		LEVERAGE;
      // } else if (shortHolding) {
      // 	INIT_ASSETS =
      // 		(Math.abs(Number(shortHolding.positionAmt)) * mark_price) /
      // 		LEVERAGE;
      // }

      // console.log('------------------');
      // console.log(
      // 	`availableBalance`,
      // 	availableBalance,
      // 	'currentTotalAsset',
      // 	currentTotalAsset,
      // 	'INIT_ASSETS',
      // 	INIT_ASSETS
      // );
      // console.log('------------------');
    } catch (e) {
      // if(result.error_message) throw new Error('Cannot get position!');
      restart("getPosition");
    }
  }

  let holding = globalHolding;
  if (holding && holding.length) {
    longHolding = holding.find(
      (item) =>
        item.symbol === symbol &&
        item.positionSide &&
        item.positionSide.toUpperCase() == "LONG" &&
        Math.abs(Number(item.positionAmt)) > 0
    );
    shortHolding = holding.find(
      (item) =>
        item.symbol === symbol &&
        item.positionSide &&
        item.positionSide.toUpperCase() == "SHORT" &&
        Math.abs(Number(item.positionAmt)) > 0
    );
  }

  if (longHolding) {
    const { leverage, entryPrice: avg_cost } = longHolding;
    longRatio =
      ((Number(mark_price) - Number(avg_cost)) * Number(leverage)) /
      Number(mark_price);
    maxWinRatio = Math.max(maxWinRatio, longRatio);
  }

  if (shortHolding) {
    const { leverage, entryPrice: avg_cost } = shortHolding;
    shortRatio =
      ((Number(mark_price) - Number(avg_cost)) * Number(leverage)) /
      Number(mark_price);
    shortRatio = -shortRatio;
    maxWinRatio = Math.max(maxWinRatio, shortRatio);
  }

  let totalRatio = 0;
  // let w_Position = 0;
  // let t_Position = 0;
  // if (holding && holding.length) {
  // 	holding.forEach((item) => {
  // 		const {
  // 			leverage,
  // 			entryPrice: avg_cost,
  // 			positionAmt,
  // 			positionSide,
  // 		} = item;
  // 		if (
  // 			Math.abs(Number(positionAmt)) > 0 &&
  // 			positionAmt &&
  // 			positionSide
  // 		) {
  // 			const current_mark_price = Number(mark_price);
  // 			let ratio =
  // 				((Number(current_mark_price) - Number(avg_cost)) *
  // 					Number(leverage)) /
  // 				Number(current_mark_price);
  // 			if (positionSide.toUpperCase() == 'SHORT') ratio = -ratio;
  // 			w_Position +=
  // 				ratio * Math.abs(Number(positionAmt)) * current_mark_price;
  // 			t_Position +=
  // 				Math.abs(Number(positionAmt)) * current_mark_price;
  // 		}
  // 	});
  // 	if (w_Position && t_Position) totalRatio = w_Position / t_Position;
  // }

  const TOTALRATIO = totalRatio;
  const CLOSE_WIN_CONDITION = holding && TOTALRATIO > WIN_MAX;
  const CLOSE_LOSS_CONDITION = longRatio < LOSS_MAX && shortRatio < LOSS_MAX;

  const { isUpperReverse, isLowerReverse } = fnIsMacdReverse(
    macdList,
    atrList,
    symbol
  );

  const isLongHoldingExceed = fnGetIsHoldingExceed(holding, "long");
  const isShortHoldingExceed = fnGetIsHoldingExceed(holding, "short");

  const MAIN_OPEN_LONG_CONDITION1 =
    !longHolding && isLowerReverse && !isLongHoldingExceed;
  const MAIN_OPEN_SHORT_CONDITION1 =
    !shortHolding && isUpperReverse && !isShortHoldingExceed;

  const MAIN_CLOSE_LONG_CONDITION1 =
    longHolding && fnGetIsLoss(longHolding, mark_price);
  //  || isUpperReverse|| longRatio < LOSS_MAX
  const MAIN_CLOSE_SHORT_CONDITION1 =
    shortHolding && fnGetIsLoss(shortHolding, mark_price);
  //   || isLowerReverse || shortRatio < LOSS_MAX

  const MAIN_CLOSE_ALL_CONDITION =
    false && (CLOSE_WIN_CONDITION || CLOSE_LOSS_CONDITION);

  let openLongCondition = MAIN_OPEN_LONG_CONDITION1;
  let openShortCondition = MAIN_OPEN_SHORT_CONDITION1;
  let closeLongCondition = MAIN_CLOSE_LONG_CONDITION1;
  let closeShortCondition = MAIN_CLOSE_SHORT_CONDITION1;

  let isMarketDeal = true;
  let dealRatio = 0.01;

  const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");
  const hmsArr = currentTime.split(" ")[1].split(":");
  const lastMinuteCharacter = hmsArr[1];
  const lastSecondCharacter = hmsArr[2];
  const minuteList = ["0", "00"];
  const secondList = ["0", "00"];
  const minuteDiff = moment(currentTime).diff(
    moment(macdList[macdList.length - 1].time),
    "minute"
  );

  const isFiveM =
    true ||
    (minuteDiff < 90 &&
      minuteList.includes(lastMinuteCharacter) &&
      !secondList.includes(lastSecondCharacter));

  // console.log('************************************', currentTime);
  // console.log(
  // 	'symbol',
  // 	symbol,
  // 	'longRatio',
  // 	longRatio,
  // 	'shortRatio',
  // 	shortRatio,
  // 	'isUpperReverse',
  // 	isUpperReverse,
  // 	'isLowerReverse',
  // 	isLowerReverse,
  // 	'ATR',
  // 	atrList[atrList.length - 1],
  // 	'ATR_PRICE_OBJ',
  // 	ATR_PRICE_OBJ[symbol + '_ATR']
  // );
  // console.log(
  // 	'macd',
  // 	macdList.slice(-1).map(({ column, open, close, time }) => ({
  // 		column,
  // 		open,
  // 		close,
  // 		time,
  // 	}))
  // );
  // console.log('w_Position', w_Position, 't_Position', t_Position);
  // console.log('************************************');

  const patchPosition = async (holding, direction) => {
    let positionAmt = Number(holding.positionAmt) * 2;
    await openPosition({
      position: positionAmt,
      openSide: direction,
      mark_price,
    });
  };

  const closeAllPosition = async () => {
    const pList = [];
    holding.forEach((item) => {
      pList.push(closePosition(item));
    });
    await Promise.all(pList);
  };

  if (MAIN_CLOSE_ALL_CONDITION) closeAllPosition();

  const closeLongPosition = async () => {
    if (longHolding && Math.abs(Number(longHolding.positionAmt))) {
      if (longRatio < LOSS_MAX && false) {
        await patchPosition(longHolding, "long");
      } else if (longRatio > WIN_MAX || longRatio < LOSS_MAX || true) {
        let closePositionAmt = Math.abs(Number(longHolding.positionAmt));
        const payload = {
          positionAmt: longHolding.positionAmt,
          position: closePositionAmt,
          side: "long",
          positionSide: "long",
          mark_price,
          ratio: longRatio,
          symbol: longHolding.symbol,
        };
        await closePosition(payload, false, avail);
      }
    }
  };

  const closeShortPosition = async () => {
    if (shortHolding && Math.abs(Number(shortHolding.positionAmt))) {
      if (shortRatio < LOSS_MAX && false) {
        await patchPosition(shortHolding, "long");
      } else if (shortRatio > WIN_MAX || shortRatio < LOSS_MAX || true) {
        let closePositionAmt = Math.abs(Number(shortHolding.positionAmt));
        const payload = {
          positionAmt: shortHolding.positionAmt,
          position: closePositionAmt,
          side: "short",
          positionSide: "short",
          mark_price,
          ratio: shortRatio,
          symbol: shortHolding.symbol,
        };
        await closePosition(payload, false, avail);
      }
    }
  };

  //平多仓条件
  if (closeLongCondition && isFiveM) {
    try {
      await closeLongPosition();
    } catch (e) {
      console.log(e);
    }
  }

  //平空仓条件
  if (closeShortCondition && isFiveM) {
    try {
      await closeShortPosition();
    } catch (e) {
      console.log(e);
    }
  }

  //开多仓条件
  if (openLongCondition) {
    try {
      let openPositionAmt = Number(
        ((INIT_ASSETS * LEVERAGE) / mark_price).toFixed(
          quantityFixedMap[symbol]
        )
      );
      if (isFiveM /* && avail >= openPositionAmt */) {
        await openPosition(
          {
            position: openPositionAmt,
            openSide: "long",
            mark_price,
            symbol,
            lastMacd: macdList.slice(-1)[0],
          },
          atrList
        );
      }
    } catch (e) {
      console.log(e);
    }
  }

  //开空仓条件
  if (openShortCondition) {
    try {
      let openPositionAmt = Number(
        ((INIT_ASSETS * LEVERAGE) / mark_price).toFixed(
          quantityFixedMap[symbol]
        )
      );

      if (isFiveM /* && avail >= openPositionAmt */) {
        await openPosition(
          {
            position: openPositionAmt,
            openSide: "short",
            mark_price,
            symbol,
            lastMacd: macdList.slice(-1)[0],
          },
          atrList
        );
      }
    } catch (e) {
      console.log(e);
    }
  }

  // if (longHolding && shortHolding) {
  // 	await waitTime(1000 * 1);
  // 	if (holding.length === 2) {
  // 		await fnTwoHoldingHandler(
  // 			longHolding,
  // 			shortHolding,
  // 			longRatio,
  // 			shortRatio
  // 		);
  // 	} else if (holding.length === 3) {
  // 		await fnThirdHoldingHandler(
  // 			holding,
  // 			longHolding,
  // 			longRatio,
  // 			shortRatio,
  // 			eth_mark_price
  // 		);
  // 	}
  // 	console.log;
  // 	console.log('holdingLength', holding.length);
  // 	console.log('*********************');
  // }
}
const fnTwoHoldingHandler = async (
  longHolding,
  shortHolding,
  longRatio,
  shortRatio
) => {
  const btcBasicPositionAmt = Number(
    Math.abs(
      Number(longHolding.positionAmt) / INIT_LONG_SHORT_ASSETS_RATIO
    ).toFixed(3)
  );
  const ethBasicPositionAmt = Number(
    Math.abs(Number(shortHolding.positionAmt)).toFixed(3)
  );
  const offsetRatio = Math.abs(shortRatio) - Math.abs(longRatio);
  if (offsetRatio > MAX_OFFSET_RATIO && shortRatio < 0) {
    const openPositionAmt = ethBasicPositionAmt;
    const payload = {
      positionAmt: openPositionAmt,
      position: openPositionAmt,
      side: "long",
      openSide: "long",
      symbol: ETH_SYMBOL,
    };
    await openPosition(payload);

    // const closePositionAmt = btcBasicPositionAmt;
    // const closePayload = {
    // 	positionAmt: closePositionAmt,
    // 	position: closePositionAmt,
    // 	side: 'long',
    // 	positionSide: 'long',
    // 	symbol: BTC_SYMBOL,
    // };
    // await closePosition(closePayload);
  }
};

const fnThirdHoldingHandler = async (
  holding,
  longHolding,
  longRatio,
  shortRatio,
  eth_mark_price
) => {
  const btcBasicPositionAmt = Number(
    Math.abs(Number(longHolding.positionAmt)).toFixed(3)
  );
  const ethHoldingList = holding.filter(
    (item) =>
      item.symbol === ETH_SYMBOL && Math.abs(Number(item.positionAmt)) > 0
  );
  const ethLongHolding = ethHoldingList.find(
    (item) => item.positionSide.toUpperCase() == "LONG"
  );
  const { leverage, entryPrice: avg_cost } = ethLongHolding;
  const ethLongRatio =
    ((Number(eth_mark_price) - Number(avg_cost)) * Number(leverage)) /
    Number(eth_mark_price);

  const offsetRatio = Math.abs(shortRatio) - Math.abs(longRatio);
  if (offsetRatio < 0 || ethLongRatio < -MAX_OFFSET_RATIO) {
    // const openPositionAmt = btcBasicPositionAmt;
    // const openPayload = {
    // 	positionAmt: openPositionAmt,
    // 	position: openPositionAmt,
    // 	side: 'long',
    // 	openSide: 'long',
    // 	symbol: BTC_SYMBOL,
    // };
    // await openPosition(openPayload);

    const { positionAmt } = ethLongHolding;
    const closePositionAmt = Number(Math.abs(Number(positionAmt)).toFixed(3));
    const payload = {
      positionAmt: closePositionAmt,
      position: closePositionAmt,
      side: "long",
      positionSide: "long",
      symbol: ETH_SYMBOL,
    };
    await closePosition(payload);
  }
};

const checkDeal = async (oldData, symbol) => {
  const data = cloneDeep(oldData);
  return await checkByStep(
    {
      macdList: data.macdList.slice(-80),
      rsiList: data.rsiList.slice(-80),
      bollList: data.bollList.slice(-80),
      atrList: data.atrList.slice(-80),
    },
    symbol
  );
};

const cancelReduceOnly = async (direction) => {
  let isHasReduceOnly = false;
  const result = await cAuthClientBN.swap.openOrders();
  if (result && result.length) {
    const index = result.findIndex(
      (item) => item.positionSide == direction && item.reduceOnly
    );
    if (index != -1) isHasReduceOnly = true;
  }
  if (isHasReduceOnly) {
    const time = 1000 * 2;
    await countdownCancelAll(time);
  }
};

var configBN = require("./configBN2");
const cAuthClientBN = new customAuthClientBN(
  configBN.httpkey,
  configBN.httpsecret,
  configBN.urlHost
);

var express = require("express");
var app = express();

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

function send(res, ret) {
  var str = JSON.stringify(ret);
  res.send(str);
}

function getCurrentMacd(list, last) {
  const newList = JSON.parse(JSON.stringify(list));
  let macdList = [];
  newList.map((item, index) => {
    let result = {};
    if (index == 0) {
      result = last || {
        ema5: Number(item[4]),
        ema10: Number(item[4]),
        ema20: Number(item[4]),
        ema60: Number(item[4]),
        ema12: Number(item[4]),
        ema26: Number(item[4]),
        diff: 0,
        dea: 0,
        column: 0,
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4]),
        quantity: Number(item[5]),
        time: moment(parseInt(item[0])).format("YYYY-MM-DD HH:mm:ss"),
        week: moment(parseInt(item[0])).day(),
      };
    } else {
      const lastResult = macdList[macdList.length - 1];
      const payload = {
        lastEma5: lastResult.ema5,
        lastEma10: lastResult.ema10,
        lastEma20: lastResult.ema20,
        lastEma60: lastResult.ema60,
        lastEma12: lastResult.ema12,
        lastEma26: lastResult.ema26,
        lastDea: lastResult.dea,
        open: Number(item[1]),
        high: Number(item[2]),
        low: Number(item[3]),
        close: Number(item[4]),
        quantity: Number(item[5]),
        time: moment(parseInt(item[0])).format("YYYY-MM-DD HH:mm:ss"),
        week: moment(parseInt(item[0])).day(),
      };
      result = getMacd(payload);
    }

    macdList.push(result);
  });

  macdList = macdList.slice(-1400);
  return macdList;
}

function getCurrentRSI(list) {
  const newList = JSON.parse(JSON.stringify(list));
  let rsiList = [];
  function* gen() {
    for (let i = 0; i < Math.min(newList.length, 400); i++) {
      if (i > 0) list.pop();
      const result = getRSI(
        Number(list[list.length - 1][0]),
        Number(list[list.length - 1][4]),
        list.map((item) => Number(item[4]))
      );
      rsiList.push(result);
      yield i;
    }
  }

  for (let k of gen()) {
    if (k >= Math.min(newList.length, 400)) break;
  }

  rsiList = rsiList.reverse();
  // rsiList = rsiList.slice(-2)
  return rsiList;
}

function getBOLL(list) {
  const N = 20;
  const k = 2;

  const newList = list.slice(-N);

  const MA =
    newList.reduce((pre, cur, index) => {
      if (index === 0) return pre;
      return Number(pre) + Number(cur[4]);
    }, Number(newList[0][4])) / N;
  const MD = Math.sqrt(
    newList.reduce((pre, cur, index) => {
      if (index === 0) return pre;
      return pre + Math.pow(Number(cur[4]) - MA, 2);
    }, Math.pow(Number(newList[0][4]) - MA, 2)) / N
  );

  const UP = MA + k * MD;
  const DN = MA - k * MD;

  return {
    MA,
    UP,
    DN,
    time: moment(parseInt(newList[newList.length - 1][0])).format(
      "YYYY-MM-DD HH:mm:ss"
    ),
  };
}

function getCurrentBOLL(list) {
  const newList = JSON.parse(JSON.stringify(list));
  const result = [];

  for (let i = newList.length; i >= 1; i -= 1) {
    let currentBOLL = {};
    if (i >= 20) {
      currentBOLL = getBOLL(newList.slice(i - 20, i));
    }
    result.push(currentBOLL);
  }
  result.reverse();
  return result;
}

app.get("/test", function (req, res) {
  send(res, { errcode: 0, errmsg: "ok" });
});

function getUUID() {
  function S4() {
    // eslint-disable-next-line no-bitwise
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
  }
  return `${S4() + S4()}${S4()}${S4()}${S4()}${S4()}${S4()}${S4()}`;
}

const queryLatestOpenOrders = async () => {
  const params = { symbol: BTC_SYMBOL, limit: 30 };
  const orders = await cAuthClientBN.swap.allOrders(params);
  orders.reverse();
  console.log(orders, orders.length);
  const latestLongOrder = orders.find(
    (item) =>
      item.positionSide == "LONG" &&
      !item.reduceOnly &&
      Number(item.executedQty)
  );
  const latestShortOrder = orders.find(
    (item) =>
      item.positionSide == "SHORT" &&
      !item.reduceOnly &&
      Number(item.executedQty)
  );

  return [latestLongOrder, latestShortOrder];

  // const latestOpenOrder = orders.find(
  //   (item) => !item.reduceOnly && Number(item.executedQty)
  // );
};

let openOrigClientOrderId = "";
let closeOrigClientOrderId = "";
const closeLimitPosition = async (params) => {
  let { position = INIT_POSITION, positionSide, symbol, price } = params;
  const type = positionSide.toUpperCase() === "LONG" ? "SELL" : "BUY";
  console.log(
    "closeLimitOrderMoment",
    positionSide,
    moment().format("YYYY-MM-DD HH:mm:ss")
  );
  console.log("position", position, "type", type, "side", positionSide);

  const newSize = Math.abs(Number(position.toFixed(quantityFixedMap[symbol])));
  const newPrice = price.toFixed(priceFixedMap[symbol]);
  const newClientOrderId = getUUID();
  closeOrigClientOrderId = newClientOrderId;

  const payload = {
    symbol,
    side: type,
    positionSide: positionSide.toUpperCase() === "LONG" ? "LONG" : "SHORT",
    quantity: newSize,
    recvWindow: 5000,
    type: "LIMIT",
    timeInForce: "GTC",
    price: newPrice,
  };
  let result;
  try {
    result = await cAuthClientBN.swap.postOrder(payload);
    positionChange = true;

    console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
    console.log(payload);
    // closeOrigClientOrderId = result.clientOrderId;
    console.log("closeOrigClientOrderId", closeOrigClientOrderId);
    console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
  } catch (e) {
    // throw new Error('Error');
    restart("close");
  }
  console.log("###################################");
  console.log("closePositionMoment", moment().format("YYYY-MM-DD HH:mm:ss"));
  console.log("###################################");
  return result;
};
const openPosition = async (params = {}, atrList) => {
  const isMarketDeal = true;
  const dealRatio = 0.01;
  const { openSide = "long", position, mark_price, symbol } = params;

  async function postOrder(size) {
    const type = openSide == "long" ? "BUY" : "SELL";

    let price = mark_price;
    if (openSide == "long") {
      price = mark_price * (1 - dealRatio / LEVERAGE);
    } else {
      price = mark_price * (1 + dealRatio / LEVERAGE);
    }
    const payload = {
      symbol,
      side: type,
      positionSide: openSide == "long" ? "LONG" : "SHORT",
      quantity: Math.abs(size),
      recvWindow: 5000,
      type: "MARKET",
    };
    console.log(
      "openOtherOrderMoment",
      openSide,
      symbol,
      "INIT_ASSETS",
      INIT_ASSETS,
      moment().format("YYYY-MM-DD HH:mm:ss")
    );
    console.log("payload", payload);
    try {
      const result = await cAuthClientBN.swap.postOrder(payload);
      positionChange = true;

      openOrigClientOrderId = result.clientOrderId;
    } catch (e) {
      // throw new Error('Error');
      restart("open");
    }
  }
  await postOrder(position, mark_price);
  if (atrList) {
    await writeData(params, atrList);
    setTimeout(async () => {
      await fnCloseLimitOrder(params, atrList);
    }, 1000 * 3);
  }
};

const fnCloseLimitOrder = async (params, atrList) => {
  const { openSide = "long", position, mark_price, symbol, lastMacd } = params;
  const { high, low } = lastMacd;
  const ATR = atrList[atrList.length - 1] * ATR_WIN_RATIO * 1;
  const isLong = openSide.toUpperCase() == "LONG";
  const price = isLong
    ? Math.max(Number(high), Number(mark_price)) + ATR
    : Math.min(Number(low), Number(mark_price)) - ATR;
  const side = isLong ? "SELL" : "BUY";
  const positionSide = isLong ? "LONG" : "SHORT";
  const payload = {
    price,
    symbol,
    side,
    positionSide,
    position: Number(position) / 1,
  };
  await closeLimitPosition(payload);
  // const price2 = isLong ? mark_price + ATR * 2 : mark_price - ATR * 2;
  // const payload2 = {
  // 	price: price2,
  // 	symbol,
  // 	side,
  // 	positionSide,
  // 	position: Number(position) / 2,
  // };
  // await closeLimitPosition(payload2);
};

const closePosition = async (holding, isCloseAll = false, avail) => {
  let { position = INIT_POSITION, positionSide, symbol } = holding;
  position = Math.abs(Number(holding.positionAmt));

  async function postOrder(size) {
    const newClientOrderId = getUUID();
    closeOrigClientOrderId = newClientOrderId;

    const type = positionSide.toUpperCase() == "LONG" ? "SELL" : "BUY";

    const payload = {
      symbol,
      side: type,
      positionSide: positionSide.toUpperCase() == "LONG" ? "LONG" : "SHORT",
      quantity: Math.abs(size),
      recvWindow: 5000,
      type: "MARKET",
    };
    try {
      const result = await cAuthClientBN.swap.postOrder(payload);
      positionChange = true;

      console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
      closeOrigClientOrderId = result.clientOrderId;
      console.log("closeOrigClientOrderId", closeOrigClientOrderId);
      console.log(symbol),
        console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
    } catch (e) {
      // throw new Error('Error');
      restart("close");
    }
  }
  console.log("###################################");
  console.log("closePositionMoment", moment().format("YYYY-MM-DD HH:mm:ss"));
  console.log("###################################");
  countdownCancelAll(symbol);
  return await postOrder(position);
};

let positionChange = true;
let globalHolding = null;
/*
ATR = ((n-1) * ATR’ + TR) / n

ATR’表示昨天的ATR，TR表示今天的真实波动幅度，n表示计算的时间周期，通常为14。

真实波动幅度（TR）的计算公式如下：

TR = max(max(H – L, abs(H – C’)), abs(L – C’))

H表示今天的最高价，L表示今天的最低价，C’表示昨天的收盘价。
*/
function getATR(item, i, lastATR, period) {
  const open = Number(item[1]);
  const high = Number(item[2]);
  const low = Number(item[3]);
  const TR = Math.max(
    Math.max(high - low, Math.abs(high - open)),
    Math.abs(low - open)
  );
  let ATR = TR;
  if (i > 0) {
    // ATR = (period - 1) * getATR(list, i - 1, period) + TR;
    ATR = ((period - 1) * lastATR + TR) / period;
  }
  return ATR;
}

function getATRByPeriod(list, period = 13) {
  const newList = JSON.parse(JSON.stringify(list));
  const atrList = [];
  newList.forEach((item, index) => {
    const ATR = getATR(item, index, atrList[index - 1], period);
    atrList.push(ATR);
  });
  return atrList;
}

function getMacd(params) {
  const {
    close: price,
    lastEma5,
    lastEma10,
    lastEma20,
    lastEma60,
    lastEma12,
    lastEma26,
    lastDea,
    high,
    low,
    time,
    week,
    quantity,
    open,
  } = params;

  const p1 = 13;
  const p2 = 34;
  const p3 = 5;

  const ema5 = toFixedAndToNumber(
    (2 / (5 + 1)) * price + (4 / (5 + 1)) * lastEma5,
    4
  );
  const ema10 = toFixedAndToNumber(
    (2 / (10 + 1)) * price + (9 / (10 + 1)) * lastEma10,
    4
  );
  const ema20 = toFixedAndToNumber(
    (2 / (20 + 1)) * price + (19 / (20 + 1)) * lastEma20,
    4
  );
  const ema60 = toFixedAndToNumber(
    (2 / (59 + 1)) * price + (59 / (60 + 1)) * lastEma60,
    4
  );

  const ema12 = toFixedAndToNumber(
    (2 / (p1 + 1)) * price + ((p1 - 1) / (p1 + 1)) * lastEma12,
    8
  );
  const ema26 = toFixedAndToNumber(
    (2 / (p2 + 1)) * price + ((p2 - 1) / (p2 + 1)) * lastEma26,
    8
  );

  const diff = toFixedAndToNumber(ema12 - ema26, 8);
  const dea = toFixedAndToNumber(
    (2 / (p3 + 1)) * diff + ((p3 - 1) / (p3 + 1)) * lastDea,
    8
  );

  const column = toFixedAndToNumber(2 * (diff - dea), 8);

  const result = {
    open,
    close: price,
    ema5,
    ema10,
    ema20,
    ema60,
    ema12,
    ema26,
    diff,
    dea,
    column,
    high,
    low,
    quantity,
    time,
    week,
  };

  return result;
}
function toFixedAndToNumber(n, num = 1) {
  return Math.round(n * Math.pow(10, num)) / Math.pow(10, num);
}
function getRSIAverage(list, i, n) {
  let diff;
  let gainI = 0;
  let lossI = 0;
  if (i == 0) {
    diff = 0;
  } else {
    diff = Number(list[i]) - Number(list[i - 1]);
    if (diff > 0) {
      gainI = Math.max(0, diff);
    } else {
      lossI = Math.max(0, -diff);
    }
  }

  let gainAverageI;
  let lossAverageI;

  if (i == 0) {
    gainAverageI = gainI;
    lossAverageI = lossI;
  } else if (i == 1 || i == 2) {
    gainAverageI = 100;
    lossAverageI = 100;
  } else {
    const lastRSIAverage = getRSIAverage(list, i - 1, n);
    gainAverageI = (gainI + (n - 1) * lastRSIAverage.gainAverageI) / n;
    lossAverageI = (lossI + (n - 1) * lastRSIAverage.lossAverageI) / n;
  }
  return {
    gainAverageI,
    lossAverageI,
  };
}
function getRSIByPeriod(newList, period) {
  const result = getRSIAverage(newList, newList.length - 1, period);
  const { gainAverageI, lossAverageI } = result;
  // const RSI = gainAverageI / (gainAverageI + lossAverageI) * 100
  const RS = gainAverageI / (lossAverageI || 1);
  const RSI = 100 - 100 / (1 + RS);
  const newResult = {
    RSI: toFixedAndToNumber(RSI, 2),
    gainAverageI,
    lossAverageI,
  };
  return newResult;
}
function getRSI(time, price, list) {
  const { RSI: RSI1 } = getRSIByPeriod(list, rsi1);
  const { RSI: RSI2 } = getRSIByPeriod(list, rsi2);
  const { RSI: RSI3 } = getRSIByPeriod(list, rsi3);

  const result = {
    time: moment(parseInt(time)).format("YYYY-MM-DD HH:mm:ss"),
    price,
    RSI1,
    RSI2,
    RSI3,
  };
  return result;
}

function getAverage(list) {
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    sum += list[i];
  }
  let mean = sum / list.length;
  return mean;
}

const waitTime = (time = 1000 * 4) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, time);
  });
};

const countdownCancelAll = async (symbol, time = 1000 * 2) => {
  const payload = {
    symbol,
    countdownTime: time,
  };
  await cAuthClientBN.swap.countdownCancelAll(payload);
};

const fnGetSymbolResult = async (symbol, payload) => {
  const list = await cAuthClientBN.common.getHistory(symbol, payload);
  const newList = JSON.parse(JSON.stringify(list));
  // newList.pop();

  const bollList = getCurrentBOLL(newList);
  const macdList = getCurrentMacd(newList);
  // const rsiList = getCurrentRSI(newList);
  const atrList = getATRByPeriod(newList);

  // const result = {
  // 	macdList,
  // 	bollList,
  // 	rsiList: [],
  // 	atrList,
  // };

  const result = {
    macdList: macdList.slice(-80),
    bollList: bollList.slice(-80),
    rsiList: [],
    atrList: atrList.slice(-80),
  };

  return result;
};

const fnGetLastResult = (data) => {
  const obj = {};
  Object.entries(data).forEach(([key, value]) => {
    obj[key] = value.slice(0, -1);
  });
  return obj;
};

const startInterval = async () => {
  RESTART_TIME += 1;
  if (RESTART_TIME >= 1 * 14) {
    RESTART_TIME = 0;
    restart("normal");
    return;
  }
  try {
    const time = moment().valueOf();
    const payload = {
      interval: DEFAULT_INTERVAL,
      limit: 100,
      endTime: time,
    };

    const btc_result = await fnGetSymbolResult(BTC_SYMBOL, payload);
    const eth_result = await fnGetSymbolResult(ETH_SYMBOL, payload);
    const eos_result = await fnGetSymbolResult(EOS_SYMBOL, payload);
    const xrp_result = await fnGetSymbolResult(XRP_SYMBOL, payload);
    const doge_result = await fnGetSymbolResult(DOGE_SYMBOL, payload);
    const trx_result = await fnGetSymbolResult(TRX_SYMBOL, payload);
    const ltc_result = await fnGetSymbolResult(LTC_SYMBOL, payload);

    const symbolResultMap = {
      [BTC_SYMBOL]: btc_result,
      [ETH_SYMBOL]: eth_result,
      [EOS_SYMBOL]: eos_result,
      [XRP_SYMBOL]: xrp_result,
      [DOGE_SYMBOL]: doge_result,
      [TRX_SYMBOL]: trx_result,
      [LTC_SYMBOL]: ltc_result,
    };
    const symbolLastResultMap = {
      [BTC_SYMBOL]: fnGetLastResult(btc_result),
      [ETH_SYMBOL]: fnGetLastResult(eth_result),
      [EOS_SYMBOL]: fnGetLastResult(eos_result),
      [XRP_SYMBOL]: fnGetLastResult(xrp_result),
      [DOGE_SYMBOL]: fnGetLastResult(doge_result),
      [TRX_SYMBOL]: fnGetLastResult(trx_result),
      [LTC_SYMBOL]: fnGetLastResult(ltc_result),
    };
    // await checkDealList(symbolResultMap);
    await fnGetPositionAndDeal(
      checkDealList(symbolResultMap),
      checkDealList(symbolLastResultMap)
    );

    // await checkDeal(btc_result, BTC_SYMBOL);
    // await checkDeal(eth_result, ETH_SYMBOL);
    // await checkDeal(eos_result, EOS_SYMBOL);
    // await checkDeal(xrp_result, XRP_SYMBOL);
    // await checkDeal(doge_result, DOGE_SYMBOL);
    // await checkDeal(trx_result, TRX_SYMBOL);

    await waitTime(1000 * 56);
    await startInterval();
  } catch (e) {
    restart(e);
  }
};

const readData = async () => {
  let dataConfig = JSON.parse(fs.readFileSync("./app/config.json", "utf-8"));
  ATR_PRICE_OBJ = {
    BTCUSDT_ATR: dataConfig.BTCUSDT_ATR,
    ETHUSDT_ATR: dataConfig.ETHUSDT_ATR,
    EOSUSDT_ATR: dataConfig.EOSUSDT_ATR,
    XRPUSDT_ATR: dataConfig.XRPUSDT_ATR,
    DOGEUSDT_ATR: dataConfig.DOGEUSDT_ATR,
    TRXUSDT_ATR: dataConfig.TRXUSDT_ATR,
    LTCUSDT_ATR: dataConfig.LTCUSDT_ATR,
  };

  console.log("read::MODE", MODE, moment().format("YYYY-MM-DD HH:mm:ss"));
};

const writeDataByRatioSpace = async (params, ratioSpace) => {
  const { mark_price, symbol } = params;
  const ATR = (mark_price * ratioSpace) / 100;

  let key = symbol + "_ATR";
  //将修改后的配置写入文件前需要先转成json字符串格式
  let dataConfig = Object.assign(ATR_PRICE_OBJ, {
    [key]: String(ATR),
  });
  let jsonStr = JSON.stringify(dataConfig);

  const result = await new Promise((resolve) => {
    //将修改后的内容写入文件
    fs.writeFile("./app/config.json", jsonStr, function (err) {
      if (err) {
        console.error(err);
      } else {
        console.log("----------修改成功-------------");
        resolve(true);
      }
    });
  });

  return result;
};

const writeData = async (params, atrList) => {
  const { symbol } = params;
  const ATR = atrList[atrList.length - 1] * ATR_WIN_RATIO * 10;

  let key = symbol + "_ATR";
  //将修改后的配置写入文件前需要先转成json字符串格式
  let dataConfig = Object.assign(ATR_PRICE_OBJ, {
    [key]: String(ATR),
  });
  let jsonStr = JSON.stringify(dataConfig);

  const result = await new Promise((resolve) => {
    //将修改后的内容写入文件
    fs.writeFile("./app/config.json", jsonStr, function (err) {
      if (err) {
        console.error(err);
      } else {
        console.log("----------修改成功-------------");
        resolve(true);
      }
    });
  });

  return result;
};

// 定时获取交割合约账户信息
(async () => {
  await readData();
  await startInterval();
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
