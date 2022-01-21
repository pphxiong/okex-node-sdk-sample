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
const LEVERAGE = 10;
const BAO_RATIO = -0.95;
const LOSS_MAX = ((-0.1 / 1) * LEVERAGE) / 10;
const WIN_MAX = (((0.1 * 0.6) / 2) * LEVERAGE) / 10;
const CAPITAL_RATIO = 1;
const ORIGIN_INIT_POSITION = 2;
const INCREASE_FI_LIST = generatePositionList(ORIGIN_INIT_POSITION, 0).map(
  (item) => Number((item * CAPITAL_RATIO).toFixed(1))
);
let INIT_POSITION = 0.1;
const POSITION_RATIO = 1;
let RESTART_TIME = 0;

let MODE = 1;

let openOrigClientOrderId = "";
let closeOrigClientOrderId = "";
const openPosition = async (params = {}, isMarketDeal = false, dealRatio) => {
  const { positionSide, position = Number(INIT_POSITION), mark_price } = params;

  async function postOrder(size) {
    const type = positionSide == "LONG" ? "BUY" : "SELL";
    const dealRatio = 0.02;
    let price = mark_price;
    if (positionSide == "LONG") {
      price = mark_price * (1 - dealRatio / LEVERAGE);
    } else {
      price = mark_price * (1 + dealRatio / LEVERAGE);
    }
    let payload = {
      symbol: BN_SYMBOL,
      side: type,
      positionSide,
      quantity: Math.abs(size),
      recvWindow: 5000,
      // type: "MARKET",
      type: "LIMIT",
      timeInForce: "GTC",
      price: price.toFixed(2),
    };
    if (MODE == 2 || isMarketDeal) {
      payload = {
        symbol: BN_SYMBOL,
        side: type,
        positionSide,
        quantity: Math.abs(size),
        recvWindow: 5000,
        type: "MARKET",
      };
    }
    try {
      const result = await cAuthClientBN.swap.postOrder(payload);
      positionChange = true;

      openOrigClientOrderId = result.clientOrderId;
      return result;
    } catch (e) {
      // throw new Error('Error');
      restart("open");
    }
  }
  return await postOrder(position, mark_price);
};

const closePosition = async (holding, isMarketDeal = false, dealRatio) => {
  const { position = INIT_POSITION, positionSide, mark_price } = holding;
  async function postOrder(size) {
    const type = positionSide == "LONG" ? "SELL" : "BUY";
    const dealRatio = 0.02;
    let price = mark_price;
    if (positionSide == "LONG") {
      price = mark_price * (1 + dealRatio / LEVERAGE);
    } else {
      price = mark_price * (1 - dealRatio / LEVERAGE);
    }
    let payload = {
      symbol: BN_SYMBOL,
      side: type,
      positionSide,
      quantity: Math.abs(size),
      recvWindow: 5000,
      // type: "MARKET",
      type: "LIMIT",
      timeInForce: "GTC",
      price: price.toFixed(2),
    };
    if (MODE == 2 || isMarketDeal) {
      payload = {
        symbol: BN_SYMBOL,
        side: type,
        positionSide,
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

      return result;
    } catch (e) {
      // throw new Error('Error');
      restart("close");
    }
  }
  console.log("###################################");
  console.log("closePositionMoment", moment().format("YYYY-MM-DD HH:mm:ss"));
  console.log("###################################");
  return await postOrder(position, mark_price);
};

const INIT_MOST_LOSS = {
  profit: 0,
  time: null,
};
let mostLoss = INIT_MOST_LOSS;
let maxWinRatio = 0;

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

app.get("/test", function (req, res) {
  send(res, { errcode: 0, errmsg: "ok" });
});

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

const fnGetAverage = (arr) => {
  const newArr = []; // 新数组，用来放平局值的
  const timestampArr = [];
  let sum = 0; // 计算每五个数的和，用来计算平均值
  for (let i = 0; i < arr.length; i += 1) {
    // console.log(i); // 0~29
    // console.log(arr[i]); //arr[0]~arr[29]
    // 把数组中的所有数字累加
    sum += Number(arr[i].longShortRatio);
    if ((i + 1) % 3 == 0) {
      // 已经加够6个数字，要计算平均值，并且放到新数组
      newArr.push(sum / 3); // 计算出的平均值放到新数组中
      timestampArr.push(arr[i].timestamp);
      // 计算平均值结束将sum清0
      sum = 0;
    }
  }
  // console.log(newArr); // [6, 16, 26, 36, 46, 56]
  return { average: newArr, timestamp: timestampArr };
};

const fnConsoleDealOrder = async () => {
  const params = { symbol: BN_SYMBOL, limit: 450, period: "5m" };
  let accountResult = await cAuthClientBN.swap.topLongShortAccountRatio(params);
  let positionResult = await cAuthClientBN.swap.topLongShortPositionRatio(
    params
  );
  accountResult = fnGetAverage(accountResult);
  positionResult = fnGetAverage(positionResult);
  const newResult = [];
  accountResult.average.reduce((pre, cur, index) => {
    const obj = {
      account: cur / pre,
      position:
        positionResult.average[index] / positionResult.average[index - 1],
      ratio:
        positionResult.average[index] /
        positionResult.average[index - 1] /
        (cur / pre),
      timestamp: moment(accountResult.timestamp[index]).format(
        "YYYY-MM-DD HH:mm:ss"
      ),
    };

    if (obj.account < 1 && obj.ratio > 1) {
      obj.long = true;
    } else if (obj.account > 1 && obj.ratio < 1) {
      obj.short = true;
    }
    newResult.push(obj);
    return cur;
  });
  // console.log(
  //   "newResult::",
  //   newResult
  //   // newResult.filter((item) => item.long || item.short)
  // );
  console.log("5m********************");
  console.log("newResult", newResult);
  console.log("End 5m********************");
};

const dealOrderHandler = async () => {
  try {
    const data = await cAuthClientBN.common.getMarkPrice(BN_SYMBOL);
    const mark_price = Number(data.markPrice);

    const { positions } = await cAuthClientBN.swap.getPosition();
    const holdings = positions.filter(
      (item) => item.positionAmt && Math.abs(Number(item.positionAmt)) > 0
    );

    const params = { symbol: BN_SYMBOL, limit: 150, period: "5m" };
    let accountResult = await cAuthClientBN.swap.topLongShortAccountRatio(
      params
    );
    let positionResult = await cAuthClientBN.swap.topLongShortPositionRatio(
      params
    );
    accountResult = fnGetAverage(accountResult);
    positionResult = fnGetAverage(positionResult);
    const newResult = [];
    accountResult.average.reduce((pre, cur, index) => {
      const obj = {
        account: cur / pre,
        position:
          positionResult.average[index] / positionResult.average[index - 1],
        ratio:
          positionResult.average[index] /
          positionResult.average[index - 1] /
          (cur / pre),
        timestamp: moment(accountResult.timestamp[index]).format(
          "YYYY-MM-DD HH:mm:ss"
        ),
      };

      if (obj.account < 1 && obj.ratio > 1) {
        obj.short = true;
      } else if (obj.account > 1 && obj.ratio < 1) {
        obj.long = true;
      }
      newResult.push(obj);
      return cur;
    });

    const latestResult = newResult[newResult.length - 1] || {};
    if (latestResult.long || latestResult.short) {
      const pList = [];
      holdings.forEach((holding) => {
        const { leverage, entryPrice, positionAmt, positionSide } = holding;
        if (positionAmt && Math.abs(Number(positionAmt)) > 0) {
          let positionRatio =
            ((Number(mark_price) - Number(entryPrice)) * Number(leverage)) /
            Number(mark_price);

          positionRatio =
            positionSide == "LONG" ? positionRatio : -positionRatio;

          if (
            (latestResult.long && positionSide == "SHORT") ||
            (latestResult.short &&
              positionSide == "LONG") /* positionRatio > 0 */
          ) {
            const closePayload = {
              position: Math.abs(Number(positionAmt)),
              positionSide,
              mark_price,
              time: moment().format("YYYY-MM-DD HH:mm:ss"),
            };
            pList.push(closePosition(closePayload, false));
          }
        }
      });

      if (pList.length) {
        // const time = 1000 * 2;
        // await countdownCancelAll(time);
        await Promise.all(pList);
      }
    }

    if (latestResult.long || latestResult.short) {
      // const ratio = Number(latestResult.ratio);
      const positionSide = latestResult.long ? "LONG" : "SHORT";

      const { availableBalance } = await cAuthClientBN.swap.getPosition();

      const availPosition = (
        (Number(availableBalance) * LEVERAGE) /
        mark_price /
        POSITION_RATIO
      ).toFixed(3);

      // INIT_POSITION = Number(availPosition);
      const position = INIT_POSITION;

      if (Number(availPosition) > Number(position)) {
        const openPayload = {
          position: Number(position),
          positionSide,
          mark_price,
          time: moment().format("YYYY-MM-DD HH:mm:ss"),
        };
        await openPosition(openPayload, false);
      } else {
        const result = await cAuthClientBN.swap.openOrders();
        if (result && result.length) {
          const time = 1000 * 2;
          await countdownCancelAll(time);
        }
      }
    }

    console.log("5m+++++++++++++++++++++++++");
    console.log(newResult.slice(-2));
    console.log("+++++++++++++++++++++++++");
  } catch (e) {
    restart("dealOrder...");
  }
};

const startInterval = async () => {
  RESTART_TIME += 1;
  if (RESTART_TIME >= 3) {
    restart();
    return;
  }

  try {
    const params = { symbol: BN_SYMBOL, limit: 75, period: "30m" };
    let accountResult = await cAuthClientBN.swap.topLongShortAccountRatio(
      params
    );
    let positionResult = await cAuthClientBN.swap.topLongShortPositionRatio(
      params
    );
    const newResult = [];
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

      if (obj.account < 1 && obj.ratio > 1) {
        obj.short = true;
      } else if (obj.account > 1 && obj.ratio < 1) {
        obj.long = true;
      }
      newResult.push(obj);
      return cur;
    });
    console.log("30m********************");
    console.log(newResult.slice(-2));
    console.log("End 30m********************");

    const date = new Date();
    // const hour = date.getHours();
    const minute = date.getMinutes();

    // const hourList = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];
    // if (
    //   minute == 0 ||
    //   minute == "00" ||
    //   minute == 30 /* && hourList.includes(Number(hour)) */
    // ) {
    //   await dealOrderHandler();
    // } else {
    //   await fnConsoleDealOrder();
    // }

    await dealOrderHandler();

    console.log("================================");
    console.log(moment().format("YYYY-MM-DD HH:mm:ss"));
    console.log("================================");

    waitTime(1000 * 55 * 5).then(async (result) => {
      if (result) await startInterval();
    });
  } catch (e) {
    restart("date");
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
function restart(source) {
  console.log("restarting......", source);
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
