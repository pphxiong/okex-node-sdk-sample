import moment from "moment";

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
const LONG_CONDITION = 60;
const SHORT_CONDITION = 40;
const LEVERAGE = 20;
const BAO_RATIO = -0.95;
const LOSS_MAX = ((-0.1 / 2) * LEVERAGE) / 10;
const WIN_MAX = (0.1 * 1 * LEVERAGE) / 10;
const CAPITAL_RATIO = 0.4;
const INCREASE_FI_LIST = generatePositionList(1, 0).map((item) =>
  Number((item * CAPITAL_RATIO).toFixed(1))
);
const INIT_POSITION = INCREASE_FI_LIST[0];
let MODE = 1;

let rsi1 = 5;
let rsi2 = 10;
let rsi3 = 20;

const INIT_MOST_LOSS = {
  profit: 0,
  time: null,
};
let mostLoss = INIT_MOST_LOSS;
let maxWinRatio = 0;

function getRandomNumberByRange(start, end) {
  return Math.floor(Math.random() * (end - start) + start);
}

const getPowByNum = (total, n) => {
  let index = 0;
  while (Math.pow(2, index) != total / n) {
    index++;
  }
  return index;
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

let cancelInterval;
const openPosition = async (params = {}) => {
  const {
    openSide = "long",
    position = Number(INIT_POSITION),
    mark_price,
  } = params;

  async function postOrder(size, price) {
    const type = openSide == "long" ? "BUY" : "SELL";
    console.log(
      "openOtherOrderMoment",
      openSide,
      moment().format("YYYY-MM-DD HH:mm:ss")
    );
    console.log("position", position, "type", type, "side", openSide);

    const payload = {
      symbol: BN_SYMBOL,
      side: type,
      positionSide: openSide == "long" ? "LONG" : "SHORT",
      type: "MARKET",
      quantity: Math.abs(size),
      recvWindow: 5000,
    };
    try {
      await cAuthClientBN.swap.postOrder(payload);
      positionChange = true;
    } catch (e) {
      // throw new Error('Error');
      restart("open");
    }
  }
  await postOrder(position, mark_price);
};

// 平仓
const closePosition = async (holding) => {
  const { position = INIT_POSITION, side, mark_price, time } = holding;
  async function postOrder(size, price) {
    const type = side == "long" ? "SELL" : "BUY";
    const payload = {
      symbol: BN_SYMBOL,
      side: type,
      positionSide: side == "long" ? "LONG" : "SHORT",
      type: "MARKET",
      quantity: Math.abs(size),
      recvWindow: 5000,
      // timestamp: moment(new Date()).valueOf(),
    };
    try {
      await cAuthClientBN.swap.postOrder(payload);
      positionChange = true;
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

const checkDeal = async (data) => {
  await checkByStep({
    macdList: data.macdList.slice(-6),
    rsiList: data.rsiList.slice(-6),
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

    if (positionChange || !globalHolding || !globalHolding.length) {
      try {
        const { positions: holding } = await cAuthClientBN.swap.getPosition();
        globalHolding =
          holding.filter(
            (item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
          ) || [];
        positionChange = false;
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

    const latestMacdList = macdList.slice(-4);
    const latestRsiList = rsiList.slice(-4);
    let ifRSIPositiveContinuity = latestMacdList.every((item, index, arr) => {
      return (
        latestRsiList[index].RSI1 > latestRsiList[index].RSI3 &&
        latestRsiList[index].RSI3 > LONG_CONDITION
      );
    });
    let ifRSINegativeContinuity = latestMacdList.every((item, index, arr) => {
      return (
        latestRsiList[index].RSI1 < latestRsiList[index].RSI3 &&
        latestRsiList[index].RSI3 < SHORT_CONDITION
      );
    });
    let ifMacdPositiveContinuity = latestMacdList.every((item, index, arr) => {
      if (index) return latestMacdList[index] > 0;
      return (
        latestMacdList[index] > 0 &&
        latestMacdList[index].column > latestMacdList[index - 1].column
      );
    });
    let ifMacdNegativeContinuity = latestMacdList.every((item, index, arr) => {
      if (index) return latestMacdList[index] < 0;
      return (
        latestMacdList[index] < 0 &&
        latestMacdList[index].column < latestMacdList[index - 1].column
      );
    });

    const MAIN_OPEN_LONG_CONDITION =
      Number(macdList[macdList.length - 1].column) > 0 &&
      Number(macdList[macdList.length - 2].column) < 0 &&
      rsiList[rsiList.length - 2].RSI3 < SHORT_CONDITION;

    const MAIN_OPEN_SHORT_CONDITION =
      Number(macdList[macdList.length - 1].column) < 0 &&
      Number(macdList[macdList.length - 2].column) > 0 &&
      rsiList[rsiList.length - 2].RSI3 > LONG_CONDITION;

    const MAIN_OPEN_LONG_CONDITION1 = MAIN_OPEN_LONG_CONDITION;
    //  ||(ifRSIPositiveContinuity && shortRatio > WIN_MAX * 2);
    const MAIN_OPEN_SHORT_CONDITION1 = MAIN_OPEN_SHORT_CONDITION;
    //  ||(ifRSINegativeContinuity && longRatio > WIN_MAX * 2);
    const MAIN_CLOSE_LONG_CONDITION1 =
      MAIN_OPEN_SHORT_CONDITION ||
      (Number(macdList[macdList.length - 1].column) < 0 &&
        longRatio < LOSS_MAX);
    const MAIN_CLOSE_SHORT_CONDITION1 =
      MAIN_OPEN_LONG_CONDITION ||
      (Number(macdList[macdList.length - 1].column) > 0 &&
        shortRatio < LOSS_MAX);

    const MAIN_OPEN_LONG_CONDITION2 = MAIN_OPEN_SHORT_CONDITION1;
    const MAIN_OPEN_SHORT_CONDITION2 = MAIN_OPEN_LONG_CONDITION1;
    const MAIN_CLOSE_LONG_CONDITION2 = MAIN_OPEN_SHORT_CONDITION2;
    const MAIN_CLOSE_SHORT_CONDITION2 = MAIN_OPEN_LONG_CONDITION2;

    const openLongCondition =
      MODE == 1 ? MAIN_OPEN_LONG_CONDITION1 : MAIN_OPEN_LONG_CONDITION2;
    const openShortCondition =
      MODE == 1 ? MAIN_OPEN_SHORT_CONDITION1 : MAIN_OPEN_SHORT_CONDITION2;
    let closeLongCondition =
      MODE == 1 ? MAIN_CLOSE_LONG_CONDITION1 : MAIN_CLOSE_LONG_CONDITION2;
    let closeShortCondition =
      MODE == 1 ? MAIN_CLOSE_SHORT_CONDITION1 : MAIN_CLOSE_SHORT_CONDITION2;

    // openLongCondition = false;
    // openShortCondition = false;

    // if (
    //   (closeLongCondition && longRatio > WIN_MAX) ||
    //   (closeShortCondition && shortRatio > WIN_MAX) ||
    //   (longRatio == 0 && shortRatio == 0)
    // ) {
    //   const random = getRandomNumberByRange(0, 2);
    //   if (random == 0) {
    //     openLongCondition = true;
    //   } else {
    //     openShortCondition = true;
    //   }
    // }

    const currentTime = moment().format("YYYY-MM-DD HH:mm:ss");
    const hmsArr = currentTime.split(" ")[1].split(":");
    if (hmsArr[0] == "00" && hmsArr[1] == "00") isForceDeal = true;

    console.log("************************************", currentTime);
    console.log("------------------");
    // console.log("mark_price", mark_price);
    // console.log("macdList", macdList.slice(-1));
    // console.log("rsiList", rsiList.slice(-1));
    console.log("shortRatio", shortRatio);
    console.log("LOSS_MAX", LOSS_MAX);
    console.log("------------------");

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
      if (longHolding && Number(longHolding.positionAmt)) {
        const patchNum = getPowByNum(
          Number(longHolding.positionAmt),
          INIT_POSITION
        );
        if (longRatio < LOSS_MAX && patchNum < 3 && false) {
          await patchPosition(longHolding, "long");
        } else if (longRatio > WIN_MAX || longRatio < LOSS_MAX || true) {
          const payload = {
            position: Number(longHolding.positionAmt),
            side: "long",
            mark_price,
            time: macdList[macdList.length - 1].time,
          };
          await closePosition(payload);
        }
      }
    };

    const closeShortPosition = async () => {
      if (shortHolding && Number(shortHolding.positionAmt)) {
        const patchNum = getPowByNum(
          Number(shortHolding.positionAmt),
          INIT_POSITION
        );
        console.log("patchNum", patchNum);
        if (shortRatio < LOSS_MAX && patchNum < 3 && false) {
          await patchPosition(shortHolding, "long");
        } else if (shortRatio > WIN_MAX || shortRatio < LOSS_MAX || true) {
          const payload = {
            position: Number(shortHolding.positionAmt),
            side: "short",
            mark_price,
            time: macdList[macdList.length - 1].time,
          };
          await closePosition(payload);
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
          await openPosition({
            position: openPositionAmt,
            openSide: "long",
            mark_price,
            time: macdList[macdList.length - 1].time,
          });
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
          await openPosition({
            position: openPositionAmt,
            openSide: "short",
            mark_price,
            time: macdList[macdList.length - 1].time,
          });
        }
      } catch (e) {
        console.log(e);
      }
    }

    if (
      (closeLongCondition && longRatio > WIN_MAX * 4) ||
      (closeShortCondition && shortRatio > WIN_MAX * 4)
    ) {
      stop();
    }
  }
};

const startInterval = async () => {
  try {
    const time = moment().valueOf();
    const payload = {
      interval: DEFAULT_INTERVAL,
      limit: 500,
      endTime: time,
    };
    const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
    const list = data;

    const newList = JSON.parse(JSON.stringify(list));
    newList.pop();
    const macdList = getCurrentMacd(newList);
    const rsiList = getCurrentRSI(newList);

    const result = {
      macdList,
      rsiList,
    };
    await checkDeal(result);

    await waitTime(1000 * 8);
    await startInterval();
  } catch (e) {
    restart();
  }
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
