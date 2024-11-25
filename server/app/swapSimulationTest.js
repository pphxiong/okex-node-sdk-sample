import request from "../utils/request";
import moment from "moment";

// const {PublicClient} = require('@okfe/okex-node');
// const {AuthenticatedClient} = require('@okfe/okex-node');
// const customAuthClient = require('./customAuthClientV5');
const customAuthClientBN = require("./customAuthClientBN");
const querystring = require("querystring");
const fs = require("fs");

//读取配置文件，变量config的类型是Object类型
// let dataConfig = require('./configETH.json');

const isContinousLong = (list, k) => {
  let isC = true;
  for (let i = list.length - 1; i >= list.length - k; i -= 1) {
    if (list[i] && list[i].close < list[i].open) {
      isC = false;
      break;
    }
  }
  const isBeforeLong =
    (k > 1 &&
      (!list[list.length - k - 1] ||
        list[list.length - k - 1].close > list[list.length - k - 1].open)) ||
    k == 1;
  return isC && isBeforeLong;
};
const isContinousShort = (list, k) => {
  let isC = true;
  for (let i = list.length - 1; i >= list.length - k; i -= 1) {
    if (list[i] && list[i].close > list[i].open) {
      isC = false;
      break;
    }
  }
  const isBeforeShort =
    (k > 1 &&
      (!list[list.length - k - 1] ||
        list[list.length - k - 1].close < list[list.length - k - 1].open)) ||
    k == 1;
  return isC && isBeforeShort;
};

const generatePositionList = (init, num) => {
  const arr = [init];
  let i = 0;
  while (i < num) {
    init = Number((init + init * 0.06).toFixed(3));
    arr.push(init);
    i++;
  }
  return arr;
};

function getRandomNumberByRange(start, end) {
  return Math.floor(Math.random() * (end - start) + start);
}

// const OK_INSTRUMENT_ID = "ETH-USDT-SWAP";
const BN_SYMBOL = "BTCUSDT";
const LEVERAGE = 5;
const INIT_ASSETS_RATIO = 40 / 100;

const INTERVAL = "5m";
const BAO_RATIO = (-0.25 * LEVERAGE) / 10;
const LOSS_MAX = ((-0.1 / 1) * LEVERAGE) / 10;
const WIN_MAX = ((0.1 / 2) * LEVERAGE) / 10;
// const BAO_RATIO = LOSS_MAX * 2;
const CAPITAL_RATIO = 1;
const ORIGIN_INIT_POSITION = 2;
const DEFAULT_POSITION_RATIO_LIST = generatePositionList(
  ORIGIN_INIT_POSITION,
  0
);
// const DEFAULT_POSITION_RATIO_LIST = [2];
const MODE_RATIO = {
  1: DEFAULT_POSITION_RATIO_LIST,
  2: DEFAULT_POSITION_RATIO_LIST,
};
const DEFAULT_MODE = 1;
let MODE = DEFAULT_MODE;
let MODE2_NUM = 0;
const INCREASE_FI_LIST = MODE_RATIO[MODE].map((item) =>
  Number((item * CAPITAL_RATIO).toFixed(3))
);
let INIT_POSITION = INCREASE_FI_LIST[0];

let continuous_win = 0;
let continuous_loss = 0;
let lastWinOrLoss = 0; // 0: loss, 1: win
let lastPosition = INIT_POSITION;
let maxContinuousWin = 0;
let maxContinuousLoss = 0;
let lossNumTotal = 0;
let winNumTotal = 0;

let OPENCONTINOUS = 10;
let CLOSECONTINOUS = 10;
let ISCONTINOUSEAUTOCLOSE = false;

let modeChange = false;

const INIT_MOST_LOSS = {
  profit: 0,
  time: null,
};
const POSITION_RATIO_DEFAULT = 10;
let POSITION_RATIO = POSITION_RATIO_DEFAULT;
const ORIGIN_TOTAL_CAPITAL = (INIT_POSITION / LEVERAGE) * POSITION_RATIO;
let totalCapital = ORIGIN_TOTAL_CAPITAL;
let totalPosition = 0;
let receiveCapital = 0;
let minTotalCapital = totalCapital;
let maxOpenPosition = 0;
let ifIgnore = false;
let ignoreNum = 0;

let currentPosition = {};
let longPosition = {};
let shortPosition = {};
let longPatchNum = 0;
let shortPatchNum = 0;
let totalProfit = 0;
let dealDetailList = [];
let mostLoss = INIT_MOST_LOSS;
let maxWinRatio = 0;
let rsi1 = 6;
let rsi2 = 14;
let rsi3 = 24;

const DEFAULT_CONDITION = 50;
let LONG_CONDITION = DEFAULT_CONDITION;
let SHORT_CONDITION = DEFAULT_CONDITION;

let lastMode = 0;

// const REVERSE_RATIO = - 0.15 * LEVERAGE / 10;

let myInterval;

// var config = require('./configV5');
var configBN = require("./configBN");
// const cAuthClient = new customAuthClient(
//     config.httpkey,
//     config.httpsecret,
//     config.passphrase,
//     config.urlHost
// )
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
  let macdList = [];
  list.map((item, index) => {
    let result = {};
    if (index == 0) {
      result = last || {
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

function getCurrentRSI(list, last) {
  const newList = JSON.parse(JSON.stringify(list));
  let rsiList = [];
  function* gen() {
    for (let i = 0; i < Math.min(newList.length, 1400); i++) {
      if (i > 0) list.pop();
      const result = getRSI(
        Number(list[list.length - 1][0]),
        Number(list[list.length - 1][4]),
        list.map((item) => Number(item[4])),
        last
      );
      rsiList.push(result);
      yield i;
    }
  }

  for (let k of gen()) {
    if (k >= Math.min(newList.length, 1400)) break;
  }

  rsiList = rsiList.reverse();
  return rsiList;
}

app.get("/test", function (req, res) {
  send(res, { errcode: 0, errmsg: "ok" });
});

function getMacd(params) {
  const {
    close: price,
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
    open,
    close: price,
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
  // return Number(n.toFixed(num))
  return Math.round(n * Math.pow(10, num)) / Math.pow(10, num);
}
function getRSIAverage(list, i, n, last) {
  let diff;
  let gainI = 0;
  let lossI = 0;
  if (i == 0) {
    if (last) {
      diff = Number(list[i]) - last.price;
      if (diff > 0) {
        gainI = Math.max(0, diff);
      } else {
        lossI = Math.max(0, -diff);
      }
    } else {
      diff = 0;
    }
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
  } else if ((i == 1 || i == 2) && !last) {
    gainAverageI = 100;
    lossAverageI = 100;
  } else {
    const lastRSIAverage = getRSIAverage(list, i - 1, n);
    gainAverageI = (gainI + (n - 1) * lastRSIAverage.gainAverageI) / n;
    lossAverageI = (lossI + (n - 1) * lastRSIAverage.lossAverageI) / n;
  }

  // console.log('gain','loss',gainAverageI,lossAverageI)
  return {
    gainAverageI,
    lossAverageI,
  };
}
function getRSIByPeriod(newList, period, last) {
  const result = getRSIAverage(newList, newList.length - 1, period, last);
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
function getRSI(time, price, list, last) {
  const { RSI: RSI1 } = getRSIByPeriod(list, rsi1, last);
  const { RSI: RSI2 } = getRSIByPeriod(list, rsi2, last);
  const { RSI: RSI3 } = getRSIByPeriod(list, rsi3, last);

  const result = {
    time: moment(parseInt(time)).format("YYYY-MM-DD HH:mm:ss"),
    week: moment(parseInt(time)).day(),
    price,
    RSI1,
    RSI2,
    RSI3,
  };
  return result;
}
//计算向量叉乘
function crossMul(v1, v2) {
  return v1.x * v2.y - v1.y * v2.x;
}
//判断两条线段是否相交
function checkCross(p1, p2, p3, p4) {
  let v1 = { x: p1.x - p3.x, y: p1.y - p3.y },
    v2 = { x: p2.x - p3.x, y: p2.y - p3.y },
    v3 = { x: p4.x - p3.x, y: p4.y - p3.y },
    v = crossMul(v1, v3) * crossMul(v2, v3);
  v1 = { x: p3.x - p1.x, y: p3.y - p1.y };
  v2 = { x: p4.x - p1.x, y: p4.y - p1.y };
  v3 = { x: p2.x - p1.x, y: p2.y - p1.y };
  return v <= 0 && crossMul(v1, v3) * crossMul(v2, v3) <= 0 ? true : false;
}
function isTripleDown(list) {
  return list.every((item) => item.RSI1 < item.RSI2);
}
function isTripleUp(list) {
  return list.every((item) => item.RSI1 > item.RSI2);
}
function isGoldOverLapping(list, index) {
  // let isOverLapping = false
  const isOverLapping = list.every(
    (item) => /* item.RSI1 >= item.RSI2 && */ item.RSI2 >= item.RSI3
  );
  // if(
  //     // ((list[0].RSI1 <= list[0].RSI2 && list[0].RSI2 <= list[0].RSI3)
  //     // ||
  //     list[1].RSI1 >= list[1].RSI2 && list[1].RSI2 >= list[1].RSI3
  //     &&
  //     list[2].RSI1 >= list[2].RSI2 && list[2].RSI2 >= list[2].RSI3
  // ){
  //     const point1 = {
  //         x: index,
  //         y: list[0].RSI1
  //     }
  //     const point2 = {
  //         x: index + 2,
  //         y: list[2].RSI1
  //     }
  //     const point3 = {
  //         x: index,
  //         y: list[0].RSI2,
  //     }
  //     const point4 = {
  //         x: index + 2,
  //         y: list[2].RSI2
  //     }
  // if(checkCross(point1,point2,point3,point4)){
  //     isOverLapping = true
  // }
  // }
  const overlappingObj = {
    isOverLapping,
    overlappingIndex: index,
    overlappingObj: list[0],
  };
  return overlappingObj;
}
function isDeadOverLapping(list, index) {
  // let isOverLapping = false
  const isOverLapping = list.every(
    (item) => /* item.RSI1 <= item.RSI2 && */ item.RSI2 <= item.RSI3
  );
  // if(
  //     // ((list[0].RSI1 >= list[0].RSI2 && list[0].RSI2 >= list[0].RSI3)
  //     // ||
  //     list[0].RSI1 <= list[0].RSI2 && list[0].RSI2 <= list[0].RSI3
  //     &&
  //     list[1].RSI1 <= list[1].RSI2 && list[1].RSI2 <= list[1].RSI3
  //     &&
  //     list[2].RSI1 <= list[2].RSI2 && list[2].RSI2 <= list[2].RSI3
  // ){
  //     const point1 = {
  //         x: index,
  //         y: list[0].RSI1
  //     }
  //     const point2 = {
  //         x: index + 2,
  //         y: list[2].RSI1
  //     }
  //     const point3 = {
  //         x: index,
  //         y: list[0].RSI2,
  //     }
  //     const point4 = {
  //         x: index + 2,
  //         y: list[2].RSI2
  //     }
  //     // if(checkCross(point1,point2,point3,point4)){
  //         isOverLapping = true
  //     // }
  // }
  const overlappingObj = {
    isOverLapping,
    overlappingIndex: index,
    overlappingObj: list[0],
  };
  return overlappingObj;
}
function getAverage(list) {
  let sum = 0;
  for (let i = 0; i < list.length; i++) {
    sum += list[i];
  }
  let mean = sum / list.length;
  return mean;
}

function stopInterval() {
  if (myInterval) {
    clearInterval(myInterval);
    myInterval = null;
  }
}

const waitTime = (time = 1000 * 4) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, time);
  });
};

app.get("/swap/reset", async (req, response) => {
  totalProfit = 0;
  currentPosition = {};
  longPosition = {};
  shortPosition = {};
  dealDetailList = [];
  mostLoss = {};
  send(response, {
    errcode: 0,
    errmsg: "ok",
    data: { totalProfit, currentPosition, dealDetailList },
  });
});

app.get("/swap/setRSIParams", async (req, response) => {
  const { query = {} } = req;
  const { rsi1: rsiP1, rsi2: rsiP2, rsi3: rsiP3 } = query;
  rsi1 = rsiP1;
  rsi2 = rsiP2;
  rsi3 = rsiP3;
  send(response, { errcode: 0, errmsg: "ok", data: { rsi1, rsi2, rsi3 } });
});

app.get("/swap/setConditionParams", async (req, response) => {
  const { query = {} } = req;
  const { longCondition: longConditionP, shortCondition: shortConditionP } =
    query;
  LONG_CONDITION = longConditionP;
  SHORT_CONDITION = shortConditionP;
  send(response, {
    errcode: 0,
    errmsg: "ok",
    data: { LONG_CONDITION, SHORT_CONDITION },
  });
});

app.get("/swap/getHistory", async (req, response) => {
  const { query = {} } = req;
  const { time } = query;
  const payload = {
    interval: INTERVAL,
    limit: 480,
    startTime: time,
  };
  const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
  // const list = data.reverse();
  const list = data;
  send(response, { errcode: 0, errmsg: "ok", data: list });
});

let lastMacd;
let lastRSI;
let lastHistoryList = [];
app.get("/swap/startHearBeat", async (req, response) => {
  const { query = {}, body } = req;
  const {
    time,
    date,
    interval = INTERVAL,
    limit = 1500,
    isAutoReset = false,
    isInit = false,
  } = query;
  try {
    dealDetailList = [];
    mostLoss = INIT_MOST_LOSS;

    if (isAutoReset) {
      totalProfit = 0;
      maxWinRatio = 0;
      totalPosition = 0;
      // longPatchNum = 0;
      // shortPatchNum = 0;
      // currentPosition = {};
      // longPosition = {};
      // shortPosition = {};
      // totalCapital = 0;
      // maxOpenPosition = 0;
      // minTotalCapital = 0;
    }

    // const mock = require(`./mock/${date}.js`);
    // const list = mock.mockData

    const payload = {
      interval,
      // endTime: moment(Number(time)).add(1, "days").valueOf(),
      limit,
      startTime: time,
    };
    const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
    const list = data;

    if (isInit) {
      lastHistoryList = [];
    }

    const newList = JSON.parse(JSON.stringify(list));

    const macdList = getCurrentMacd(newList, lastMacd).slice(-limit);
    const rsiList = getCurrentRSI(newList, lastRSI).slice(-limit);

    lastMacd = macdList[macdList.length - 1];
    lastRSI = rsiList[rsiList.length - 1];

    const result = {
      macdList: macdList.slice(0, 30),
      rsiList: rsiList.slice(0, 30),
    };

    await checkDeal(result, isAutoReset);
    send(response, {
      errcode: 0,
      errmsg: "ok",
      data: {
        // history: list,
        // index: result,
        totalProfit: totalProfit || -0.0000001,
        totalPosition,
        totalCapital,
        minTotalCapital,
        maxOpenPosition,
        currentPosition,
        dealDetailList,
        mostLoss,
        maxContinuousWin,
        maxContinuousLoss,
        longPosition,
        shortPosition,
        lossNumTotal,
        winNumTotal,
        lastWinOrLoss,
        lastPosition,
      },
    });
  } catch (e) {
    console.log(e);
    restart("startHearBeat");
  }
});

app.get("/swap/getLatestProfit", async (req, response) => {
  const { query = {} } = req;
  const {
    time,
    interval = INTERVAL,
    limit = 1440,
    openContinous,
    closeContinous,
    isContinousAutoClose,
  } = query;
  try {
    const payload = {
      interval,
      limit,
      endTime: time,
    };
    const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
    const list = data;
    totalProfit = 0;
    // currentPosition = {};
    // longPosition = {};
    // shortPosition = {};
    dealDetailList = [];
    mostLoss = INIT_MOST_LOSS;
    maxWinRatio = 0;
    OPENCONTINOUS = openContinous;
    CLOSECONTINOUS = closeContinous;
    ISCONTINOUSEAUTOCLOSE =
      isContinousAutoClose === true || isContinousAutoClose === "true";

    const newList = JSON.parse(JSON.stringify(list));
    const macdList = getCurrentMacd(newList).slice(-1400);
    const rsiList = getCurrentRSI(newList).slice(-1400);
    const bollList = getCurrentBOLL(newList).slice(-1400);

    const result = {
      macdList,
      bollList,
      rsiList,
    };
    await checkDeal(result);
    send(response, {
      errcode: 0,
      errmsg: "ok",
      data: {
        // index: result,
        totalProfit,
        dealDetailList,
        mostLoss,
        maxContinuousWin,
        maxContinuousLoss,
        longPosition,
        shortPosition,
        lossNumTotal,
        winNumTotal,
        lastWinOrLoss,
        lastPosition,
      },
    });
  } catch (e) {
    console.log(e);
    restart();
  }
});

function fibonacci(n) {
  if (n == 1 || n == 2) {
    return 1;
  }
  return fibonacci(n - 2) + fibonacci(n - 1);
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
  console.log(newList.length, result.length);
  return result;
}

const fnIsCurrentContinousUpper = (macdList, i) => {
  return (
    macdList[i].column > 0 &&
    macdList[i].column > macdList[i - 1].column &&
    macdList[i - 1].column > macdList[i - 2].column &&
    macdList[i - 2].column > macdList[i - 3].column
    //  &&macdList[i].column > macdList[i + 1].column
  );
};

const fnIsCurrentContinousLower = (macdList, i) => {
  return (
    macdList[i].column < 0 &&
    macdList[i].column < macdList[i - 1].column &&
    macdList[i - 1].column < macdList[i - 2].column &&
    macdList[i - 2].column < macdList[i - 3].column
    //  &&macdList[i].column < macdList[i + 1].column
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

const fnIsMacdReverse = (macdList) => {
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
      for (let i = macdList.length - 13 + 3; i > 3; i -= 1) {
        const isCurrentContinousUpper = fnIsCurrentContinousUpper(macdList, i);
        if (isCurrentContinousUpper) {
          const isUpperest = fnGetIsUpperest(macdList, i, macdList.length - 2);
          // const isHasIntervalUpper = fnGetIsHasIntervalUpper(
          // 	macdList,
          // 	i,
          // 	macdList.length - 2
          // );
          isUpperReverse =
            macdList[macdList.length - 2].close >= macdList[i].close &&
            macdList[macdList.length - 2].column < macdList[i].column;
          //  && isUpperest;
          break;
        }
        // const isStartEndReverse = fnIsUpperReverse(
        // 	macdList,
        // 	i,
        // 	macdList.length - 2
        // );
        // if (isCurrentContinousUpper && isStartEndReverse) {
        // 	isUpperReverse =
        // 		fnGetIsHasIntervalUpperReverse(
        // 			macdList,
        // 			i,
        // 			macdList.length - 2
        // 		) && i + 10 < macdList.length - 2;
        // 	if (isUpperReverse) break;
        // }
      }
    }
  } else if (isUpper) {
    if (isLatestContinousLower) {
      for (let i = macdList.length - 13 + 3; i > 3; i -= 1) {
        const isCurrentContinousLower = fnIsCurrentContinousLower(macdList, i);
        if (isCurrentContinousLower) {
          const isLowerest = fnGetIsLowerest(macdList, i, macdList.length - 2);
          isLowerReverse =
            macdList[macdList.length - 2].close <= macdList[i].close &&
            macdList[macdList.length - 2].column > macdList[i].column;
          // && isLowerest;
          break;
        }
        // const isStartEndReverse = fnIsLowerReverse(
        // 	macdList,
        // 	i,
        // 	macdList.length - 2
        // );
        // if (isCurrentContinousLower && isStartEndReverse) {
        // 	isLowerReverse =
        // 		fnGetIsHasIntervalLowerReverse(
        // 			macdList,
        // 			i,
        // 			macdList.length - 2
        // 		) &&
        // 		fnGetIsHasIntervalMacdHigh(
        // 			macdList,
        // 			i,
        // 			macdList.length - 2
        // 		) &&
        // 		i + 10 < macdList.length - 2;
        // 	if (isLowerReverse) break;
        // }
      }
    }
  }
  return { isUpperReverse, isLowerReverse };
};

const checkDeal = async (data, isAutoReset = true) => {
  for (let i = 0; i < data.bollList.length - 3; i++) {
    checkByStep(
      {
        macdList: data.macdList.slice(i, i + 2),
        rsiList: data.rsiList.slice(i, i + 2),
        bollList: data.bollList.slice(i, i + 2),
      },
      i === data.bollList.length - 4
      // && i == data.macdList.length - 10
    );
  }

  function checkByStep(data, isForceDeal) {
    // isForceDeal = false;
    const { macdList, rsiList, bollList } = data;
    const mark_price = macdList[macdList.length - 1].close;

    let longHolding;
    let shortHolding;
    let longRatio = 0;
    let shortRatio = 0;
    let holding;

    if (longPosition && longPosition.positionAmt) {
      longHolding = JSON.parse(JSON.stringify(longPosition));
      holding = longHolding;
    }
    if (shortPosition && shortPosition.positionAmt) {
      shortHolding = JSON.parse(JSON.stringify(shortPosition));
      holding = shortHolding;
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

    const getMinIndex = (arr, key) => {
      let i = 0;
      arr.reduce((pre, cur, index) => {
        if (cur[key] < pre[key]) i = index;
        return cur;
      });
      return i;
    };

    const getMaxIndex = (arr, key) => {
      let i = 0;
      arr.reduce((pre, cur, index) => {
        if (cur[key] > pre[key]) i = index;
        return cur;
      });
      return i;
    };

    const minPriceIndex = getMinIndex(macdList, "low");
    const minMacdIndex = getMinIndex(macdList, "column");

    const maxPriceIndex = getMaxIndex(macdList, "high");
    const maxMacdIndex = getMaxIndex(macdList, "column");

    const ifMacdWeakenContinuity = macdList
      .slice(-6)
      .every((item, index, arr) => {
        if (index == 0) return true;
        return arr[index].column < arr[index - 1].column;
      });
    const ifMacdEnhanceContinuity = macdList
      .slice(-6)
      .every((item, index, arr) => {
        if (index == 0) return true;
        return arr[index].column > arr[index - 1].column;
      });

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
    // let ifMacdPositiveContinuity = latestMacdList.every((item, index, arr) => {
    //   if (index == 0) return true;
    //   return latestMacdList[index].column > latestMacdList[index - 1].column;
    // });
    // let ifMacdNegativeContinuity = latestMacdList.every((item, index, arr) => {
    //   if (index == 0) return true;
    //   return latestMacdList[index].column < latestMacdList[index - 1].column;
    // });

    // const isHasLongCondition = latestMacdList.some((item, index) => {
    //   if (index == 0) return false;
    //   return (
    //     Number(latestMacdList[index].column) > 0 &&
    //     latestRsiList[index].RSI1 < latestRsiList[index].RSI3 &&
    //     latestRsiList[index - 1].RSI1 > latestRsiList[index - 1].RSI3 &&
    //     latestRsiList[index].RSI3 > LONG_CONDITION
    //   );
    // });

    // const isHasShortCondition = latestMacdList.some((item, index) => {
    //   if (index == 0) return false;
    //   return (
    //     Number(latestMacdList[index].column) < 0 &&
    //     latestRsiList[index].RSI1 > latestRsiList[index].RSI3 &&
    //     latestRsiList[index - 1].RSI1 < latestRsiList[index - 1].RSI3 &&
    //     latestRsiList[index].RSI3 < SHORT_CONDITION
    //   );
    // });

    const MAIN_LONG_BASIC_CONDITION =
      Number(macdList[macdList.length - 1].column) > 0 &&
      rsiList[rsiList.length - 1].RSI3 > LONG_CONDITION;
    // Number(macdList[macdList.length - 1].column) > 0 &&
    // rsiList[rsiList.length - 1].RSI1 > rsiList[rsiList.length - 1].RSI3 &&
    // rsiList[rsiList.length - 1].RSI3 > LONG_CONDITION;
    // rsiList[rsiList.length - 2].RSI3 < LONG_CONDITION;
    // rsiList[rsiList.length - 2].RSI1 > rsiList[rsiList.length - 2].RSI3 &&
    // rsiList[rsiList.length - 2].RSI1 > rsiList[rsiList.length - 2].RSI3 &&
    // rsiList[rsiList.length - 2].RSI1 < LONG_CONDITION;
    // (shortRatio >= 0 || shortRatio <= LOSS_MAX);

    const MAIN_SHORT_BASIC_CONDITION =
      Number(macdList[macdList.length - 1].column) < 0 &&
      rsiList[rsiList.length - 2].RSI3 > SHORT_CONDITION;
    // rsiList[rsiList.length - 1].RSI1 < rsiList[rsiList.length - 1].RSI3 &&
    // rsiList[rsiList.length - 1].RSI3 < SHORT_CONDITION;
    // Number(macdList[macdList.length - 1].column) < 0 &&
    // rsiList[rsiList.length - 1].RSI3 < rsiList[rsiList.length - 2].RSI3 &&
    // rsiList[rsiList.length - 1].RSI3 < SHORT_CONDITION &&
    // (longRatio >= 0 || longRatio <= LOSS_MAX);

    // const MAIN_OPEN_LONG_CONDITION1 =
    // 	!longHolding &&
    // 	((rsiList[rsiList.length - 1].RSI2 > OPENCONTINOUS &&
    // 		rsiList[rsiList.length - 2].RSI2 < OPENCONTINOUS) ||
    // 		(rsiList[rsiList.length - 1].RSI2 > OPENCONTINOUS + 20 &&
    // 			rsiList[rsiList.length - 2].RSI2 < OPENCONTINOUS + 20 &&
    // 			shortHolding));
    // const MAIN_OPEN_SHORT_CONDITION1 =
    // 	!shortHolding &&
    // 	((rsiList[rsiList.length - 1].RSI2 < CLOSECONTINOUS &&
    // 		rsiList[rsiList.length - 2].RSI2 > CLOSECONTINOUS) ||
    // 		(rsiList[rsiList.length - 1].RSI2 < CLOSECONTINOUS - 20 &&
    // 			rsiList[rsiList.length - 2].RSI2 > CLOSECONTINOUS - 20 &&
    // 			longHolding));

    // const MAIN_CLOSE_LONG_CONDITION1 =
    // 	longHolding &&
    // 	((rsiList[rsiList.length - 1].RSI2 < OPENCONTINOUS + 20 &&
    // 		rsiList[rsiList.length - 2].RSI2 > OPENCONTINOUS + 20 &&
    // 		(longRatio > 0 ||
    // 			(longRatio < 0 &&
    // 				shortRatio < 0 &&
    // 				rsiList[rsiList.length - 1].RSI2 < CLOSECONTINOUS &&
    // 				rsiList[rsiList.length - 2].RSI2 > CLOSECONTINOUS))) ||
    // 		isForceDeal);
    // const MAIN_CLOSE_SHORT_CONDITION1 =
    // 	shortHolding &&
    // 	((rsiList[rsiList.length - 1].RSI2 > CLOSECONTINOUS - 20 &&
    // 		rsiList[rsiList.length - 2].RSI2 < CLOSECONTINOUS - 20 &&
    // 		(shortRatio > 0 ||
    // 			(longRatio < 0 &&
    // 				shortRatio < 0 &&
    // 				rsiList[rsiList.length - 1].RSI2 > OPENCONTINOUS &&
    // 				rsiList[rsiList.length - 2].RSI2 < OPENCONTINOUS))) ||
    // 		isForceDeal);

    // const { isUpperReverse, isLowerReverse } = fnIsMacdReverse(macdList);

    const MAIN_OPEN_LONG_CONDITION1 =
      !longHolding &&
      macdList[macdList.length - 1].close < bollList[bollList.length - 1].DN;
    const MAIN_OPEN_SHORT_CONDITION1 =
      !shortHolding &&
      macdList[macdList.length - 1].close > bollList[bollList.length - 1].UP;

    const MAIN_CLOSE_LONG_CONDITION1 =
      longHolding &&
      (macdList[macdList.length - 1].close > bollList[bollList.length - 1].DN ||
        macdList[macdList.length - 1].close <
          bollList[bollList.length - 1].DN ||
        isForceDeal);
    const MAIN_CLOSE_SHORT_CONDITION1 =
      shortHolding &&
      ((macdList[macdList.length - 1].close <
        bollList[bollList.length - 1].UP &&
        macdList[macdList.length - 1].close >
          bollList[bollList.length - 1].UP) ||
        isForceDeal);

    if (modeChange) lastMode = lastMode ? 0 : 1;

    const MAIN_OPEN_LONG_CONDITION2 = MAIN_OPEN_SHORT_CONDITION1;
    const MAIN_OPEN_SHORT_CONDITION2 = MAIN_OPEN_LONG_CONDITION1;
    const MAIN_CLOSE_LONG_CONDITION2 = MAIN_OPEN_SHORT_CONDITION2;
    const MAIN_CLOSE_SHORT_CONDITION2 = MAIN_OPEN_LONG_CONDITION2;

    modeChange = false;
    let openLongCondition =
      MODE == 1 ? MAIN_OPEN_LONG_CONDITION1 : MAIN_OPEN_LONG_CONDITION2;
    let openShortCondition =
      MODE == 1 ? MAIN_OPEN_SHORT_CONDITION1 : MAIN_OPEN_SHORT_CONDITION2;
    let closeLongCondition =
      MODE == 1 ? MAIN_CLOSE_LONG_CONDITION1 : MAIN_CLOSE_LONG_CONDITION2;
    let closeShortCondition =
      MODE == 1 ? MAIN_CLOSE_SHORT_CONDITION1 : MAIN_CLOSE_SHORT_CONDITION2;

    // const { week } = macdList[macdList.length - 1];

    // if (week == 6 || week == 0) {
    //   MODE = 2;
    // } else {
    //   MODE = 1;
    // }

    // if (MODE == 1) {
    //   if (
    //     (closeLongCondition && longRatio > WIN_MAX) ||
    //     (closeShortCondition && shortRatio > WIN_MAX)
    //   ) {
    //     MODE = 2;
    //     openLongCondition = !openLongCondition;
    //     openShortCondition = !openShortCondition;
    //   }
    // } else if (MODE == 2) {
    //   if (
    //     (ifRSIPositiveContinuity && longRatio < 0) ||
    //     (ifRSINegativeContinuity && shortRatio < 0)
    //   ) {
    //     MODE = 1;
    //   }
    // }

    let fiIndex = INCREASE_FI_LIST.findIndex(
      (item) => holding && item == Number(holding.positionAmt)
    );

    fiIndex =
      fiIndex == INCREASE_FI_LIST.length - 1
        ? INCREASE_FI_LIST.length - 2
        : fiIndex;

    // if (!isForceDeal && MODE == 2) {
    //   if (closeShortCondition && shortRatio < LOSS_MAX) {
    //     openLongCondition = false;
    //     openShortCondition = true;
    //     // fiIndex = -1;
    //     if (fiIndex >= 2) {
    //       MODE = 1;
    //     }
    //   } else if (closeLongCondition && longRatio < LOSS_MAX) {
    //     openLongCondition = true;
    //     openShortCondition = false;
    //     // fiIndex = -1;
    //     if (fiIndex >= 2) {
    //       MODE = 1;
    //     }
    //   }
    // }

    // if (MODE == 1 && (longRatio > WIN_MAX || shortRatio > WIN_MAX)) {
    //   MODE = 2;
    // }

    if (
      (MODE == 1 && closeLongCondition && longRatio > WIN_MAX * 2) ||
      (closeShortCondition && shortRatio > WIN_MAX * 2)
    ) {
      // ifIgnore = true;
    }

    if (ifIgnore) {
      openLongCondition = false;
      openShortCondition = false;

      ignoreNum++;
      if (ignoreNum >= 72) {
        ifIgnore = false;
        ignoreNum = 0;
      }
    }

    // console.log('************************************', moment().format('YYYY-MM-DD HH:mm:ss'))
    // console.log('------------------')
    // console.log('mark_price',mark_price)
    // console.log('macdList',macdList.slice(-2))
    // console.log('latestColumnsObjList',rsiList.slice(-2))
    // console.log('------------------')

    // const closeHalfPosition = async (holding, direction) => {
    //   let positionAmt = Number(holding.positionAmt) / 2;
    //   const price =
    //     (Number(holding.entryPrice) * Number(holding.positionAmt) -
    //       (Number(mark_price) * Number(holding.positionAmt)) / 2) /
    //     positionAmt;

    //   let currentProfit = 0;

    //   if (direction == "LONG") {
    //     currentProfit =
    //       (longRatio * longHolding.positionAmt) / 2 / LEVERAGE -
    //       (0  * 0.01 * longHolding.positionAmt) / 2;
    //   } else {
    //     currentProfit =
    //       (shortRatio * shortHolding.positionAmt) / 2 / LEVERAGE -
    //       (0  * 0.01 * shortHolding.positionAmt) / 2;
    //   }
    //   totalProfit += currentProfit;
    //   totalCapital += currentProfit;

    //   if (direction == "LONG") {
    //     longPosition = {
    //       positionSide: direction,
    //       leverage: LEVERAGE,
    //       entryPrice: price,
    //       positionAmt,
    //       time: macdList[macdList.length - 1].time,
    //     };
    //   } else {
    //     shortPosition = {
    //       positionSide: direction,
    //       leverage: LEVERAGE,
    //       entryPrice: price,
    //       positionAmt,
    //       time: macdList[macdList.length - 1].time,
    //     };
    //   }

    //   const dealDetail = {
    //     side: "CLOSE",
    //     positionSide: direction,
    //     entryPrice: price,
    //     positionAmt,
    //     time: macdList[macdList.length - 1].time,
    //     totalProfit,
    //     currentProfit,
    //     macd: macdList[macdList.length - 1],
    //     rsi: rsiList[rsiList.length - 1],
    //     MODE,
    //     isCloseHalf: true,
    //   };
    //   dealDetailList.push(dealDetail);

    //   if (direction == "LONG") {
    //     longPatchNum -= 1;
    //   } else {
    //     shortPatchNum -= 1;
    //   }
    // };

    // if (longRatio > LOSS_MAX / 4 && longPatchNum > 0) {
    //   closeHalfPosition(longHolding, "LONG");
    // } else if (shortRatio > LOSS_MAX / 4 && shortPatchNum > 0) {
    //   closeHalfPosition(shortHolding, "SHORT");
    // }

    const patchPosition = async (holding, direction) => {
      console.log("patchPosition", holding);
      let positionAmt = Number(holding.positionAmt) * 2;
      const price =
        (Number(mark_price) * Number(holding.positionAmt) +
          Number(holding.entryPrice) * Number(holding.positionAmt)) /
        positionAmt;

      totalProfit += (-0.02 * 0.01 * positionAmt) / 2;
      totalCapital += (-0.02 * 0.01 * positionAmt) / 2;
      if (totalCapital < positionAmt / 2) positionAmt = 0;
      maxOpenPosition = Math.max(maxOpenPosition, positionAmt);
      if (direction == "LONG") {
        longPosition = {
          positionSide: direction,
          leverage: LEVERAGE,
          entryPrice: price,
          positionAmt,
          time: macdList[macdList.length - 1].time,
          week: macdList[macdList.length - 1].week,
        };
      } else {
        shortPosition = {
          positionSide: direction,
          leverage: LEVERAGE,
          entryPrice: price,
          positionAmt,
          time: macdList[macdList.length - 1].time,
          week: macdList[macdList.length - 1].week,
        };
      }
      const dealDetail = {
        side: "OPEN",
        positionSide: direction,
        leverage: LEVERAGE,
        entryPrice: price,
        positionAmt,
        time: macdList[macdList.length - 1].time,
        macdList,
        rsiList,
      };

      dealDetailList.push(dealDetail);
      if (direction == "LONG") {
        longPatchNum += 1;
      } else {
        shortPatchNum += 1;
      }
    };

    const closeLong = async () => {
      if (
        shortHolding &&
        Number(shortHolding.positionAmt) &&
        // shortPatchNum <= 1 &&
        shortRatio < 0 &&
        false
      ) {
        await patchPosition(shortHolding, "SHORT");
      } else if (longHolding && Number(longHolding.positionAmt)) {
        if (longRatio < LOSS_MAX && longPatchNum < 3 && false) {
          await patchPosition(longHolding, "LONG");
        } else if (longRatio < LOSS_MAX || longRatio > WIN_MAX || true) {
          if (longRatio < 0) modeChange = true;
          if (longRatio < 0) {
            lossNumTotal++;
            // openLongCondition = false;
            // openShortCondition = true;
          } else if (longRatio > 0) {
            winNumTotal++;
          }
          const currentProfit =
            (longRatio * longHolding.positionAmt) / LEVERAGE -
            0.02 * 0.01 * longHolding.positionAmt;
          totalProfit += currentProfit;
          totalCapital += currentProfit;
          minTotalCapital = Math.min(minTotalCapital, totalCapital);
          const dealDetail = {
            side: "CLOSE",
            positionSide: "LONG",
            entryPrice: mark_price,
            positionAmt: longHolding.positionAmt,
            time: macdList[macdList.length - 1].time,
            week: macdList[macdList.length - 1].week,
            totalProfit,
            totalCapital,
            currentProfit: (longRatio * longHolding.positionAmt) / LEVERAGE,
            macd: macdList[macdList.length - 1],
            rsi: rsiList[rsiList.length - 1],
            MODE,
            longRatio,
          };
          dealDetailList.push(dealDetail);
          if (longRatio < mostLoss.profit) {
            mostLoss = {
              profit: (longRatio * longHolding.positionAmt) / LEVERAGE,
              time: macdList[macdList.length - 1].time,
            };
          }
          // if (isForceDeal || ifIgnore) {
          longHolding = {};
          longPosition = {};
          // }
          maxWinRatio = 0;
          longPatchNum = 0;
        }
      }
    };

    const closeShort = async () => {
      if (
        longHolding &&
        Number(longHolding.positionAmt) &&
        // longPatchNum <= 1 &&
        longRatio < 0 &&
        false
      ) {
        await patchPosition(longHolding, "LONG");
      } else if (shortHolding && Number(shortHolding.positionAmt)) {
        if (shortRatio < LOSS_MAX && shortPatchNum < 3 && false) {
          await patchPosition(shortHolding, "SHORT");
        } else if (shortRatio < LOSS_MAX || shortRatio > WIN_MAX || true) {
          if (shortRatio < 0) {
            lossNumTotal++;
            // openLongCondition = true;
            // openShortCondition = false;
          } else if (longRatio > 0) {
            winNumTotal++;
          }
          if (shortRatio < 0) modeChange = true;
          const currentProfit =
            (shortRatio * shortHolding.positionAmt) / LEVERAGE -
            0.02 * 0.01 * shortHolding.positionAmt;
          totalProfit += currentProfit;
          totalCapital += currentProfit;
          minTotalCapital = Math.min(minTotalCapital, totalCapital);
          const dealDetail = {
            side: "CLOSE",
            positionSide: "SHORT",
            entryPrice: mark_price,
            positionAmt: shortHolding.positionAmt,
            time: macdList[macdList.length - 1].time,
            week: macdList[macdList.length - 1].week,
            totalProfit,
            totalCapital,
            currentProfit: (shortRatio * shortHolding.positionAmt) / LEVERAGE,
            macd: macdList[macdList.length - 1],
            rsi: rsiList[rsiList.length - 1],
            MODE,
            shortRatio,
          };
          dealDetailList.push(dealDetail);
          if (shortRatio < mostLoss.profit) {
            mostLoss = {
              profit: (shortRatio * shortHolding.positionAmt) / LEVERAGE,
              time: macdList[macdList.length - 1].time,
            };
          }
          // if (isForceDeal || ifIgnore) {
          shortHolding = {};
          shortPosition = {};
          // }
          maxWinRatio = 0;
          shortPatchNum = 0;
        }
      }
    };

    //平多仓条件
    if (closeLongCondition) {
      try {
        closeLong();
        // if(longRatio > WIN_MAX * 2) MODE = DEFAULT_MODE
      } catch (e) {
        console.log(e);
      }
    }

    //平空仓条件
    if (closeShortCondition) {
      try {
        closeShort();
        const increasePosition = INCREASE_FI_LIST[fiIndex + 1];
        // if(shortRatio > WIN_MAX * 2) MODE = DEFAULT_MODE
      } catch (e) {
        console.log(e);
      }
    }

    // if ((totalCapital * LEVERAGE) / 10 > ORIGIN_INIT_POSITION * 4) {
    //   receiveCapital += totalCapital - (ORIGIN_INIT_POSITION * 4) / LEVERAGE;
    //   totalCapital = totalCapital - receiveCapital;
    // }

    // if (closeLongCondition || closeShortCondition) {
    //   if (longRatio > WIN_MAX || shortRatio > WIN_MAX) {
    //     POSITION_RATIO = POSITION_RATIO_DEFAULT * 10;
    //   } else {
    //     POSITION_RATIO = POSITION_RATIO_DEFAULT;
    //   }
    // }

    // INIT_POSITION =
    //   longRatio > WIN_MAX || shortRatio > WIN_MAX
    //     ? Math.min(
    //         (totalCapital * LEVERAGE) / POSITION_RATIO,
    //         ORIGIN_INIT_POSITION * 2
    //       )
    //     : Math.min(
    //         (totalCapital * LEVERAGE) / POSITION_RATIO,
    //         ORIGIN_INIT_POSITION * 2
    //       );

    // INIT_POSITION = (totalCapital * LEVERAGE) / POSITION_RATIO;

    //开多仓条件
    if (openLongCondition) {
      try {
        if (
          !longHolding ||
          !Number(longHolding.positionAmt)
          // &&
          // &&
          // !shortPatchNum
          // (!shortHolding || !Number(shortHolding.positionAmt))
        ) {
          // closeShort()
          // const openPositionAmt = shortRatio < LOSS_MAX ? INIT_POSITION * 2 : INIT_POSITION
          // let openPositionAmt = INIT_POSITION;
          let openPositionAmt = totalCapital * INIT_ASSETS_RATIO;
          const ratio = shortRatio;
          const increasePosition = INCREASE_FI_LIST[fiIndex + 1];
          const decreasePosition = INCREASE_FI_LIST[0];
          // if (ratio < WIN_MAX) {
          //   openPositionAmt = increasePosition;
          // }
          // else if (ratio < LOSS_MAX) {
          //   openPositionAmt = decreasePosition;
          // }
          // if(modeChange) openPositionAmt = INIT_POSITION;

          // if (totalCapital * LEVERAGE < openPositionAmt)
          // 	openPositionAmt = 0;
          totalCapital += -0.02 * 0.01 * openPositionAmt;
          totalProfit += -0.02 * 0.01 * openPositionAmt;
          totalPosition += openPositionAmt;

          minTotalCapital = Math.min(minTotalCapital, totalCapital);
          maxOpenPosition = Math.max(maxOpenPosition, openPositionAmt);
          longPosition = {
            positionSide: "LONG",
            leverage: LEVERAGE,
            entryPrice: mark_price,
            positionAmt: openPositionAmt,
            time: macdList[macdList.length - 1].time,
          };
          const dealDetail = {
            side: "OPEN",
            positionSide: "LONG",
            leverage: LEVERAGE,
            entryPrice: mark_price,
            positionAmt: openPositionAmt,
            time: macdList[macdList.length - 1].time,
            week: macdList[macdList.length - 1].week,
            macdList,
            rsiList,
            MODE,
            totalProfit,
            totalCapital,
          };
          dealDetailList.push(dealDetail);
          // shortHolding = {};
          // shortPosition = {};

          // if(ratio < LOSS_MAX * 1) MODE = MODE == 1 ? 2 : 1
        }
      } catch (e) {
        console.log(e);
      }
    }

    //开空仓条件
    if (openShortCondition) {
      try {
        if (
          // !longHolding ||
          // !Number(longHolding.positionAmt)
          // &&
          !shortHolding ||
          !Number(shortHolding.positionAmt)
          // &&
          // !longPatchNum
        ) {
          // closeLong()
          // const openPositionAmt = longRatio < LOSS_MAX ? INIT_POSITION * 2 : INIT_POSITION
          // let openPositionAmt = INIT_POSITION;
          let openPositionAmt = totalCapital * INIT_ASSETS_RATIO;

          const ratio = longRatio;
          const increasePosition = INCREASE_FI_LIST[fiIndex + 1];
          const decreasePosition = INCREASE_FI_LIST[0];
          // if (ratio < WIN_MAX) {
          //   openPositionAmt = increasePosition;
          // }
          // else if (ratio < LOSS_MAX) {
          //   openPositionAmt = decreasePosition;
          // }
          // if(modeChange) openPositionAmt = INIT_POSITION;

          // if (totalCapital * LEVERAGE < openPositionAmt)
          // 	openPositionAmt = 0;
          totalCapital += -0.02 * 0.01 * openPositionAmt;
          totalProfit += -0.02 * 0.01 * openPositionAmt;
          totalPosition += openPositionAmt;

          minTotalCapital = Math.min(minTotalCapital, totalCapital);
          maxOpenPosition = Math.max(maxOpenPosition, openPositionAmt);
          shortPosition = {
            positionSide: "SHORT",
            leverage: LEVERAGE,
            entryPrice: mark_price,
            positionAmt: openPositionAmt,
            time: macdList[macdList.length - 1].time,
          };
          const dealDetail = {
            side: "OPEN",
            positionSide: "SHORT",
            leverage: LEVERAGE,
            entryPrice: mark_price,
            positionAmt: openPositionAmt,
            time: macdList[macdList.length - 1].time,
            week: macdList[macdList.length - 1].week,
            macdList,
            rsiList,
            MODE,
            totalProfit,
            totalCapital,
          };
          dealDetailList.push(dealDetail);
          // longHolding = {};
          // longPosition = {};

          // if(ratio < LOSS_MAX * 1) MODE = MODE == 1 ? 2 : 1
        }
      } catch (e) {
        console.log(e);
      }
    }
  }
};

app.post("/swap/startHearBeat", async (req, response) => {
  console.log(req.query);
  send(response, { errcode: 0, errmsg: "ok", data: {} });
  return;
  //1.通过判断url路径和请求方式来判断是否是表单提交
  if (req.url === "/swap/startHearBeat" && req.method === "POST") {
    //创建空字符叠加数据片段
    let data = "";

    //2.注册data事件接收数据（每当收到一段表单提交的数据，该方法会执行一次）
    req.on("data", function (chunk) {
      // chunk 默认是一个二进制数据，和 data 拼接会自动 toString
      data += chunk;
    });

    // 3.当接收表单提交的数据完毕之后，就可以进一步处理了
    //注册end事件，所有数据接收完成会执行一次该方法
    req.on("end", async () => {
      const dataObject = querystring.parse(data);

      const {
        time,
        date,
        interval = INTERVAL,
        limit = 1500,
        isAutoReset = true,
        initList = [],
      } = dataObject;
      try {
        dealDetailList = [];
        mostLoss = INIT_MOST_LOSS;

        if (isAutoReset) {
          totalProfit = 0;
          maxWinRatio = 0;
          currentPosition = {};
          longPosition = {};
          shortPosition = {};
        }

        // const mock = require(`./mock/${date}.js`);
        // const list = mock.mockData

        const payload = {
          interval,
          limit,
          startTime: time,
        };
        const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
        const list = data;

        const newList = JSON.parse(JSON.stringify(initList.concat(list)));

        const macdList = getCurrentMacd(newList, lastMacd);
        const rsiList = getCurrentRSI(newList, lastRSI);

        const result = {
          macdList,
          rsiList,
        };
        // lastMacd = macdList[macdList.length-1]
        // lastRSI = rsiList[rsiList.length-1]

        await checkDeal(result, isAutoReset);
        send(response, {
          errcode: 0,
          errmsg: "ok",
          data: {
            // history: list,
            // index: result,
            totalProfit,
            currentPosition,
            dealDetailList,
            mostLoss,
            initList: list.slice(-200),
          },
        });
      } catch (e) {
        console.log(e);
        restart("startHearBeat");
      }
    });
  }
});

const readData = async () => {
  let dataConfig = JSON.parse(
    fs.readFileSync("./app/lastHistoryList.json", "utf-8")
  );
  return dataConfig.lastHistoryList;
};

const writeData = async (data) => {
  //将修改后的配置写入文件前需要先转成json字符串格式
  let dataConfig = {
    lastHistoryList: JSON.stringify(data).toString(),
  };
  let jsonStr = JSON.stringify(dataConfig);

  const result = await new Promise((resolve) => {
    //将修改后的内容写入文件
    fs.writeFile("./app/lastHistoryList.json", jsonStr, function (err) {
      if (err) {
        // console.error(err);
      } else {
        // console.log('----------修改成功-------------');
        resolve(true);
      }
    });
  });

  return result;
};

// 定时获取交割合约账户信息
(async () => {
  // await startInterval()
})();
app.listen(8092);

console.log("8092 server start");

process.on("uncaughtException", function (err) {
  //打印出错误
  // console.log('uncaughtException',err);
  restart();
});

let exec = require("child_process").exec;
function restart(resource) {
  console.log("restarting......", resource);
  setTimeout(() => {
    exec("npm run restart:product", function (err, stdout, stderr) {
      if (err) {
        console.log("restarting failed");
      } else {
        console.log("restarting success");
      }
    });
  }, 1000 * 10);
}
