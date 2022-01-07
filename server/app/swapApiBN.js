import moment from "moment";
const fs = require("fs");

const customAuthClientBN = require("./customAuthClientBN");

const generatePositionList = (init, num) => {
  const arr = [init];
  let i = 0;
  while (i < num) {
    init = Number((init + init * 0.14).toFixed(1));
    arr.push(init);
    i++;
  }
  return arr;
};

const BN_SYMBOL = "ETHUSDT";
const DEFAULT_INTERVAL = "5m";
const LONG_CONDITION = 50;
const SHORT_CONDITION = 50;
const LEVERAGE = 20;
const BAO_RATIO = -0.95;
const LOSS_MAX = ((-0.1 / 1) * LEVERAGE) / 10;
const WIN_MAX = (((0.1 * 0.6) / 2) * LEVERAGE) / 10;
const CAPITAL_RATIO = 1;
const ORIGIN_INIT_POSITION = 2;
const INCREASE_FI_LIST = generatePositionList(ORIGIN_INIT_POSITION, 0).map(
  (item) => Number((item * CAPITAL_RATIO).toFixed(1))
);
let INIT_POSITION = 0.1;
const POSITION_RATIO = 100;
let RESTART_TIME = 0;

let MODE = 1;

let rsi1 = 8;
let rsi2 = 12;
let rsi3 = 24;

const INIT_MOST_LOSS = {
  profit: 0,
  time: null,
};
let mostLoss = INIT_MOST_LOSS;
let maxWinRatio = 0;

const checkDeal = async (data) => {
  await checkByStep({
    macdList: data.macdList.slice(-10),
    rsiList: data.rsiList.slice(-10),
  });

  async function checkByStep(data, isForceDeal) {
    const { macdList, rsiList } = data;
    let mark_price;
    try {
      const data = await cAuthClientBN.common.getMarkPrice(BN_SYMBOL);
      mark_price = Number(data.markPrice);
    } catch (e) {
      restart("getMarkPrice");
    }

    let longHolding;
    let shortHolding;
    let longRatio = 0;
    let shortRatio = 0;

    if (positionChange || !globalHolding || !globalHolding.length || true) {
      try {
        const { positions: holding, availableBalance } =
          await cAuthClientBN.swap.getPosition();
        globalHolding =
          holding.filter(
            (item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
          ) || [];
        positionChange = false;

        const availPosition = (
          (Number(availableBalance) * LEVERAGE) /
          mark_price /
          POSITION_RATIO
        ).toFixed(3);

        // INIT_POSITION = Math.min(
        //   Number(availPosition),
        //   ORIGIN_INIT_POSITION * 2
        // );

        INIT_POSITION = Number(availPosition);

        // await readData();
        MODE = 1;
        console.log("------------------");
        console.log(
          `availableBalance`,
          availableBalance,
          "INIT_POSITION",
          INIT_POSITION
        );
        console.log("------------------");
      } catch (e) {
        // if(result.error_message) throw new Error('Cannot get position!');
        restart("getPosition");
      }
    }

    let holding = globalHolding;
    if (holding && holding.length) {
      longHolding = holding.find(
        (item) =>
          item.positionSide &&
          item.positionSide.toUpperCase() == "LONG" &&
          Math.abs(Number(item.positionAmt)) > 0
      );
      shortHolding = holding.find(
        (item) =>
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

    const latestMacdList = macdList.slice(-6);
    const latestRsiList = rsiList.slice(-6);
    let ifRSIPositiveContinuity = latestMacdList.every((item, index, arr) => {
      return (
        // latestRsiList[index].RSI1 > latestRsiList[index].RSI2 &&
        latestRsiList[index].RSI1 > latestRsiList[index].RSI3
      );
    });
    let ifRSINegativeContinuity = latestMacdList.every((item, index, arr) => {
      return (
        // latestRsiList[index].RSI1 < latestRsiList[index].RSI2 &&
        latestRsiList[index].RSI1 < latestRsiList[index].RSI3
      );
    });

    const MAIN_OPEN_LONG_CONDITION =
      Number(macdList[macdList.length - 1].column) > 0 &&
      rsiList[rsiList.length - 1].RSI3 > LONG_CONDITION;

    const MAIN_OPEN_SHORT_CONDITION =
      Number(macdList[macdList.length - 1].column) < 0 &&
      rsiList[rsiList.length - 1].RSI3 < SHORT_CONDITION;

    const MAIN_OPEN_LONG_CONDITION1 = MAIN_OPEN_LONG_CONDITION;
    const MAIN_OPEN_SHORT_CONDITION1 = MAIN_OPEN_SHORT_CONDITION;
    const MAIN_CLOSE_LONG_CONDITION1 = MAIN_OPEN_SHORT_CONDITION1;
    const MAIN_CLOSE_SHORT_CONDITION1 = MAIN_OPEN_LONG_CONDITION1;

    const MAIN_OPEN_LONG_CONDITION2 = MAIN_OPEN_SHORT_CONDITION1;
    const MAIN_OPEN_SHORT_CONDITION2 = MAIN_OPEN_LONG_CONDITION1;
    const MAIN_CLOSE_LONG_CONDITION2 = MAIN_OPEN_SHORT_CONDITION2;
    const MAIN_CLOSE_SHORT_CONDITION2 = MAIN_OPEN_LONG_CONDITION2;

    let openLongCondition =
      MODE == 1 ? MAIN_OPEN_LONG_CONDITION1 : MAIN_OPEN_LONG_CONDITION2;
    let openShortCondition =
      MODE == 1 ? MAIN_OPEN_SHORT_CONDITION1 : MAIN_OPEN_SHORT_CONDITION2;
    let closeLongCondition =
      MODE == 1 ? MAIN_CLOSE_LONG_CONDITION1 : MAIN_CLOSE_LONG_CONDITION2;
    let closeShortCondition =
      MODE == 1 ? MAIN_CLOSE_SHORT_CONDITION1 : MAIN_CLOSE_SHORT_CONDITION2;

    // if (openLongCondition || openShortCondition) {
    //   const time = 1000 * 1;
    //   await countdownCancelAll(time);
    // }

    let isMarketDeal = false;

    const result = await cAuthClientBN.swap.openOrders();
    if (result && result.length) {
      const side =
        rsiList[rsiList.length - 1].RSI3 > LONG_CONDITION ? "LONG" : "SHORT";

      let index = -1;
      index = result.findIndex(
        (item) => item.positionSide == side && !item.reduceOnly
      );
      if (index != -1) {
        const order = result[index];
        const diff = moment().diff(order.time, "minute");
        if (diff >= 5) {
          const time = 1000 * 2;
          await countdownCancelAll(time);
          if (side == "LONG") {
            openLongCondition = true;
          } else {
            openShortCondition = true;
          }
        }
      }

      let closeIndex = -1;
      closeIndex = result.findIndex(
        (item) => item.positionSide == side && item.reduceOnly
      );
      if (closeIndex != -1) {
        const order = result[closeIndex];
        const diff = moment().diff(order.time, "minute");
        if (diff >= 5) {
          const time = 1000 * 2;
          await countdownCancelAll(time);
          if (side == "LONG") {
            closeLongCondition = true;
          } else {
            closeShortCondition = true;
          }
        }
      }
    }

    let dealRatio = 0.01;
    // if (
    //   // Number(macdList[macdList.length - 1].column) > 0 &&
    //   rsiList[rsiList.length - 1].RSI1 > rsiList[rsiList.length - 1].RSI3 &&
    //   rsiList[rsiList.length - 2].RSI1 < rsiList[rsiList.length - 2].RSI3 &&
    //   rsiList[rsiList.length - 1].RSI3 > LONG_CONDITION &&
    //   MODE == 1
    // ) {
    //   dealRatio = 0.2;
    //   // await cancelReduceOnly("LONG");
    //   closeLongCondition = true;
    // } else if (
    //   // Number(macdList[macdList.length - 1].column) < 0 &&
    //   rsiList[rsiList.length - 1].RSI1 < rsiList[rsiList.length - 1].RSI3 &&
    //   rsiList[rsiList.length - 2].RSI1 > rsiList[rsiList.length - 2].RSI3 &&
    //   rsiList[rsiList.length - 1].RSI3 < SHORT_CONDITION &&
    //   MODE == 1
    // ) {
    //   dealRatio = 0.2;
    //   // await cancelReduceOnly("SHORT");
    //   closeShortCondition = true;
    // }

    const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const hmsArr = currentTime.split(" ")[1].split(":");
    const lastCharacter = hmsArr[1].slice(-1);
    const isFiveM = lastCharacter == 0 || lastCharacter == 5;

    // if (
    //   Number(macdList[macdList.length - 1].column) < 0 &&
    //   rsiList[rsiList.length - 1].RSI1 > rsiList[rsiList.length - 1].RSI3 &&
    //   rsiList[rsiList.length - 2].RSI1 < rsiList[rsiList.length - 2].RSI3 &&
    //   rsiList[rsiList.length - 1].RSI3 > LONG_CONDITION &&
    //   MODE == 1 &&
    //   longRatio < 0
    // ) {
    //   dealRatio = 0.03;
    //   await cancelReduceOnly('LONG');
    //   closeLongCondition = true;
    // } else if (
    //   Number(macdList[macdList.length - 1].column) > 0 &&
    //   rsiList[rsiList.length - 1].RSI1 < rsiList[rsiList.length - 1].RSI3 &&
    //   rsiList[rsiList.length - 2].RSI1 > rsiList[rsiList.length - 2].RSI3 &&
    //   rsiList[rsiList.length - 1].RSI3 < SHORT_CONDITION &&
    //   MODE == 1 &&
    //   shortRatio < 0
    // ) {
    //   dealRatio = 0.03;
    //   await cancelReduceOnly('SHORT');
    //   closeShortCondition = true;
    // }

    // if (
    //   MODE == 1 &&
    //   ((closeLongCondition && longRatio > WIN_MAX) ||
    //     (closeShortCondition && shortRatio > WIN_MAX))
    // ) {
    //   MODE = 2;
    //   await writeData();
    //   openLongCondition = !openLongCondition;
    //   openShortCondition = !openShortCondition;
    // } else if (
    //   MODE == 2 &&
    //   ((ifRSIPositiveContinuity && longRatio < 0 && isFiveM) ||
    //     (ifRSINegativeContinuity && shortRatio < 0 && isFiveM))
    // ) {
    //   MODE = 1;
    //   await writeData();
    // }

    console.log("************************************", currentTime);
    // console.log("mark_price", mark_price);
    console.log("macdList", macdList.slice(-1)[0]);
    console.log("rsiList", rsiList.slice(-1)[0]);
    console.log("longRatio", longRatio, "shortRatio", shortRatio);
    console.log(
      "longPositionAmt",
      longHolding && longHolding.positionAmt,
      "shortPositionAmt",
      shortHolding && shortHolding.positionAmt
    );
    console.log("MODE", MODE);
    console.log(
      "closeLongCondition",
      closeLongCondition,
      "closeShortCondition",
      closeShortCondition,
      "openLongCondition",
      openLongCondition,
      "openShortCondition",
      openShortCondition
    );
    console.log("************************************");

    const patchPosition = async (holding, direction) => {
      let positionAmt = Number(holding.positionAmt) * 2;
      await openPosition({
        position: positionAmt,
        openSide: direction,
        mark_price,
        time: macdList[macdList.length - 1].time,
      });
    };

    const closeLongPosition = async () => {
      if (longHolding && Math.abs(Number(longHolding.positionAmt))) {
        // const patchNum = getPowByNum(
        //   Math.abs(Number(longHolding.positionAmt)),
        //   INIT_POSITION
        // );
        if (longRatio < LOSS_MAX && false) {
          await patchPosition(longHolding, "long");
        } else if (longRatio > WIN_MAX || longRatio < LOSS_MAX || true) {
          const payload = {
            position: Math.abs(Number(longHolding.positionAmt)),
            side: "long",
            mark_price,
            time: macdList[macdList.length - 1].time,
          };
          await closePosition(payload, isMarketDeal, dealRatio);
        }
      }
    };

    const closeShortPosition = async () => {
      if (shortHolding && Math.abs(Number(shortHolding.positionAmt))) {
        // const patchNum = getPowByNum(
        //   Math.abs(Number(shortHolding.positionAmt)),
        //   INIT_POSITION
        // );
        if (shortRatio < LOSS_MAX && false) {
          await patchPosition(shortHolding, "long");
        } else if (shortRatio > WIN_MAX || shortRatio < LOSS_MAX || true) {
          const payload = {
            position: Math.abs(Number(shortHolding.positionAmt)),
            side: "short",
            mark_price,
            time: macdList[macdList.length - 1].time,
          };
          await closePosition(payload, isMarketDeal, dealRatio);
        }
      }
    };

    //平多仓条件
    if (closeLongCondition) {
      try {
        await closeLongPosition();
      } catch (e) {
        console.log(e);
      }
    }

    //平空仓条件
    if (closeShortCondition) {
      try {
        await closeShortPosition();
      } catch (e) {
        console.log(e);
      }
    }

    //开多仓条件
    if (openLongCondition) {
      try {
        if (
          !longHolding ||
          !Number(longHolding.positionAmt)
          // && (!shortHolding || !Number(shortHolding.positionAmt))
        ) {
          // await closeShortPosition()
          let fiIndex;
          fiIndex = INCREASE_FI_LIST.findIndex(
            (item) =>
              shortHolding && item == Math.abs(Number(shortHolding.positionAmt))
          );
          fiIndex =
            fiIndex == INCREASE_FI_LIST.length - 1
              ? INCREASE_FI_LIST.length - 2
              : fiIndex;
          let openPositionAmt = INIT_POSITION;
          const ratio = shortRatio;
          const increasePosition = INCREASE_FI_LIST[fiIndex + 1];
          // if (ratio < WIN_MAX * 2) {
          //   openPositionAmt = increasePosition;
          // }
          console.log("shortHolding", shortHolding);
          console.log("ratio", ratio);
          console.log("openPositionAmt", openPositionAmt);
          await openPosition(
            {
              position: openPositionAmt,
              openSide: "long",
              mark_price,
              time: macdList[macdList.length - 1].time,
            },
            isMarketDeal,
            dealRatio
          );
        }
      } catch (e) {
        console.log(e);
      }
    }

    //开空仓条件
    if (openShortCondition) {
      try {
        if (
          // (!longHolding || !Number(longHolding.positionAmt))
          // &&
          !shortHolding ||
          !Number(shortHolding.positionAmt)
        ) {
          // await closeLongPosition();
          let fiIndex;
          fiIndex = INCREASE_FI_LIST.findIndex(
            (item) =>
              longHolding && item == Math.abs(Number(longHolding.positionAmt))
          );
          fiIndex =
            fiIndex == INCREASE_FI_LIST.length - 1
              ? INCREASE_FI_LIST.length - 2
              : fiIndex;
          let openPositionAmt = INIT_POSITION;
          const ratio = longRatio;
          const increasePosition = INCREASE_FI_LIST[fiIndex + 1];
          console.log("longHolding", longHolding);
          console.log("ratio", ratio);
          // if (ratio < WIN_MAX * 2) {
          //   openPositionAmt = increasePosition;
          // }
          await openPosition(
            {
              position: openPositionAmt,
              openSide: "short",
              mark_price,
              time: macdList[macdList.length - 1].time,
            },
            isMarketDeal,
            dealRatio
          );
        }
      } catch (e) {
        console.log(e);
      }
    }

    // if (
    //   (closeLongCondition && longRatio > WIN_MAX * 4) ||
    //   (closeShortCondition && shortRatio > WIN_MAX * 4)
    // ) {
    //   stop();
    // }
  }
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

function getCurrentMacd(list) {
  let macdList = [];
  list.map((item, index) => {
    let result = {};
    if (index == 0) {
      result = {
        price: Number(item[4]),
        ema12: Number(item[4]),
        ema26: Number(item[4]),
        diff: 0,
        dea: 0,
        column: 0,
        high: Number(item[2]),
        low: Number(item[3]),
        time: moment(parseInt(item[0])).format("YYYY-MM-DD HH:mm:ss"),
      };
    } else {
      const lastResult = macdList[macdList.length - 1];
      const payload = {
        price: Number(item[4]),
        lastEma12: lastResult.ema12,
        lastEma26: lastResult.ema26,
        lastDea: lastResult.dea,
        high: Number(item[2]),
        low: Number(item[3]),
        time: moment(parseInt(item[0])).format("YYYY-MM-DD HH:mm:ss"),
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

let openOrigClientOrderId = "";
let closeOrigClientOrderId = "";
const openPosition = async (params = {}, isMarketDeal = false, dealRatio) => {
  const {
    openSide = "long",
    position = Number(INIT_POSITION),
    mark_price,
  } = params;

  async function postOrder(size) {
    const type = openSide == "long" ? "BUY" : "SELL";
    console.log(
      "openOtherOrderMoment",
      openSide,
      moment().format("YYYY-MM-DD HH:mm:ss")
    );
    let payload = {
      symbol: BN_SYMBOL,
      side: type,
      positionSide: openSide == "long" ? "LONG" : "SHORT",
      quantity: Math.abs(size),
      recvWindow: 5000,
      // type: "MARKET",
      type: "LIMIT",
      timeInForce: "GTC",
      price: mark_price.toFixed(2),
    };
    if (MODE == 2 || isMarketDeal) {
      payload = {
        symbol: BN_SYMBOL,
        side: type,
        positionSide: openSide == "long" ? "LONG" : "SHORT",
        quantity: Math.abs(size),
        recvWindow: 5000,
        type: "MARKET",
      };
    }
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
};

const closePosition = async (holding, isMarketDeal = false, dealRatio) => {
  const { position = INIT_POSITION, side, mark_price, time } = holding;
  async function postOrder(size) {
    const type = side == "long" ? "SELL" : "BUY";
    // let price = mark_price;
    // if (side == 'long') {
    //   price = mark_price * (1 + dealRatio / LEVERAGE);
    // } else {
    //   price = mark_price * (1 - dealRatio / LEVERAGE);
    // }
    let payload = {
      symbol: BN_SYMBOL,
      side: type,
      positionSide: side == "long" ? "LONG" : "SHORT",
      quantity: Math.abs(size),
      recvWindow: 5000,
      // type: "MARKET",
      type: "LIMIT",
      timeInForce: "GTC",
      price: mark_price.toFixed(2),
    };
    if (MODE == 2 || isMarketDeal) {
      payload = {
        symbol: BN_SYMBOL,
        side: type,
        positionSide: side == "long" ? "LONG" : "SHORT",
        quantity: Math.abs(size),
        recvWindow: 5000,
        type: "MARKET",
      };
    }
    try {
      console.log(payload);
      const result = await cAuthClientBN.swap.postOrder(payload);
      positionChange = true;

      console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
      closeOrigClientOrderId = result.clientOrderId;
      console.log("closeOrigClientOrderId", closeOrigClientOrderId);
      console.log("price", mark_price);
      console.log("$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$");
    } catch (e) {
      // throw new Error('Error');
      restart("close");
    }
  }
  console.log("###################################");
  console.log("closePositionMoment", moment().format("YYYY-MM-DD HH:mm:ss"));
  console.log("###################################");
  await postOrder(position, mark_price);
};

let positionChange = true;
let globalHolding = null;
function getMacd(params) {
  const { price, lastEma12, lastEma26, lastDea, high, low, time } = params;

  const ema12 = toFixedAndToNumber(
    (2 / (12 + 1)) * price + (11 / (12 + 1)) * lastEma12,
    4
  );
  const ema26 = toFixedAndToNumber(
    (2 / (26 + 1)) * price + (25 / (26 + 1)) * lastEma26,
    4
  );

  const diff = toFixedAndToNumber(ema12 - ema26, 2);
  const dea = toFixedAndToNumber(
    (2 / (9 + 1)) * diff + (8 / (9 + 1)) * lastDea,
    2
  );

  const column = toFixedAndToNumber(2 * (diff - dea), 2);

  const result = {
    price,
    ema12,
    ema26,
    diff,
    dea,
    column,
    high,
    low,
    time,
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

const countdownCancelAll = async (time) => {
  const payload = {
    symbol: BN_SYMBOL,
    countdownTime: time,
  };
  await cAuthClientBN.swap.countdownCancelAll(payload);
};

const startInterval = async () => {
  const params = { symbol: BN_SYMBOL, limit: 500, period: "4h" };
  const accountResult = await cAuthClientBN.swap.topLongShortAccountRatio(
    params
  );
  const positionResult = await cAuthClientBN.swap.topLongShortPositionRatio(
    params
  );
  const newResult = [];
  // accountResult.forEach((item, index) => {
  //   item.timestamp = moment(item.timestamp).format("YYYY-MM-DD HH:mm:ss");
  //   const obj = {
  //     account: item,
  //     position: result[index],
  //   };
  //   newResult.push(obj);
  // });
  accountResult.reduce((pre, cur, index) => {
    const obj = {
      account: cur.longShortRatio / pre.longShortRatio,
      position:
        positionResult[index].longShortRatio /
        positionResult[index - 1].longShortRatio,
      ratio:
        positionResult[index].longShortRatio /
        positionResult[index - 1].longShortRatio /
        (cur.longShortRatio / pre.longShortRatio),
      timestamp: moment(cur.timestamp).format("YYYY-MM-DD HH:mm:ss"),
    };
    newResult.push(obj);
    return cur;
  });
  console.log("accountAndPosition::", newResult);
  // const globalResult = await cAuthClientBN.swap.globalLongShortAccountRatio(
  //   params
  // );
  // console.log(
  //   "globalResult::",
  //   globalResult.map((item) => {
  //     item.timestamp = moment(item.timestamp).format("YYYY-MM-DD HH:mm:ss");
  //     return item;
  //   })
  // );
  return;
  RESTART_TIME += 1;
  if (RESTART_TIME >= 80) {
    restart();
    return;
  }
  try {
    const params = { symbol: BN_SYMBOL, limit: 30 };
    const orders = await cAuthClientBN.swap.allOrders(params);
    orders.reverse();
    // const longOrders = orders.filter(
    //   (item) => item.positionSide == 'LONG' && !item.reduceOnly
    // );
    // const shortOrders = orders.filter(
    //   (item) => item.positionSide == 'SHORT' && !item.reduceOnly
    // );
    // const latestLongOrder = longOrders[0];
    // const latestShortOrder = shortOrders[0];

    const latestOpenOrder = orders.find(
      (item) => !item.reduceOnly && Number(item.executedQty)
    );

    console.log("##########################################");
    console.log(
      "latestOpenOrder::",
      latestOpenOrder.positionSide,
      latestOpenOrder.avgPrice,
      latestOpenOrder.executedQty,
      moment(latestOpenOrder.time).format("YYYY-MM-DD HH:mm:ss")
    );
    console.log("##########################################");

    let isHasNoDeal = false;
    const noDealOrders = await cAuthClientBN.swap.openOrders({
      symbol: BN_SYMBOL,
    });
    if (noDealOrders && noDealOrders.length) {
      noDealOrders.forEach((item) => {
        const mark_price = item.price;

        if (latestOpenOrder) {
          let ratio =
            ((Number(mark_price) - Number(latestOpenOrder.avgPrice)) *
              Number(LEVERAGE)) /
            Number(mark_price);
          if (latestOpenOrder.positionSide == "SHORT") ratio = -ratio;
          if (ratio > WIN_MAX * 0.8 && ratio < WIN_MAX * 1.2) {
            isHasNoDeal = true;
          }
        }
      });
    }

    if (!isHasNoDeal) {
      let future_price;
      const long_high_future_price =
        (Number(latestOpenOrder.avgPrice) * Number(LEVERAGE)) /
        (Number(LEVERAGE) - WIN_MAX);
      const long_low_future_price =
        (Number(latestOpenOrder.avgPrice) * Number(LEVERAGE)) /
        (Number(LEVERAGE) + LOSS_MAX);
      const short_high_future_price =
        (Number(latestOpenOrder.avgPrice) * Number(LEVERAGE)) /
        (Number(LEVERAGE) - LOSS_MAX);
      const short_low_future_price =
        (Number(latestOpenOrder.avgPrice) * Number(LEVERAGE)) /
        (Number(LEVERAGE) + WIN_MAX);
      if (latestOpenOrder.positionSide == "LONG") {
        future_price = long_high_future_price;
        const closePayload = {
          mark_price: future_price,
          side: "long",
        };
        await closePosition(closePayload);
        const openPayload = {
          mark_price: future_price,
          openSide: "short",
        };
        await openPosition(openPayload);
        const batch_price = long_low_future_price;
        const batchPayload = {
          mark_price: batch_price,
          openSide: "long",
        };
        await openPosition(batchPayload);
      } else if (latestOpenOrder.positionSide == "SHORT") {
        future_price = short_low_future_price;
        const closePayload = {
          mark_price: future_price,
          side: "short",
        };
        await closePosition(closePayload);
        const openPayload = {
          mark_price: future_price,
          openSide: "long",
        };
        await openPosition(openPayload);
        const batch_price = short_high_future_price;
        const batchPayload = {
          mark_price: batch_price,
          openSide: "short",
        };
        await openPosition(batchPayload);
      }
    }

    // await checkDeal(result);

    await waitTime(1000 * 10);
    await startInterval();
  } catch (e) {
    restart();
  }
};

const readData = async () => {
  let dataConfig = JSON.parse(fs.readFileSync("./app/config.json", "utf-8"));
  MODE = dataConfig.MODE;

  console.log("read::MODE", MODE, moment().format("YYYY-MM-DD HH:mm:ss"));
};

const writeData = async () => {
  //将修改后的配置写入文件前需要先转成json字符串格式
  let dataConfig = {
    MODE: String(MODE),
  };
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
  await startInterval();
})();
app.listen(8093);

console.log("8093 server start");

process.on("uncaughtException", function (err) {
  //打印出错误
  // console.log('uncaughtException',err);
  restart();
});

let exec = require("child_process").exec;
function restart() {
  console.log("restarting......");
  setTimeout(() => {
    exec("npm run restart", function (err, stdout, stderr) {
      if (err) {
        console.log("restarting failed");
      } else {
        console.log("restarting success");
      }
    });
  }, 1000 * 10);
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
  }, 1000 * 10);
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
  }, 1000 * 10);
}
