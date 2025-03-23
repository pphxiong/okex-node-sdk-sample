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
const tf = require("@tensorflow/tfjs-node");
const tulind = require("tulind");

// 系统配置
const config = {
  symbol: "DOGE/USDT:USDT",
  timeframe: "15m",
  trainSize: 200,
  windowSize: 30,
  batchSize: 32,
  episodes: 50,
  gamma: 0.95,
  epsilon: 1.0,
  epsilonMin: 0.01,
  epsilonDecay: 0.995,
};

// 强化学习智能体
class DQNAgent {
  constructor(stateSize, actionSize) {
    this.stateSize = stateSize;
    this.actionSize = actionSize;
    this.memory = [];
    this.gamma = config.gamma;
    this.epsilon = config.epsilon;
    this.model = this.buildModel();
    this.targetModel = this.buildModel();
  }

  async buildModel() {
    const model = tf.sequential({
      layers: [
        tf.layers.lstm({
          units: 64,
          inputShape: [config.windowSize, this.stateSize],
          returnSequences: false,
        }),
        tf.layers.dense({ units: 32, activation: "relu" }),
        tf.layers.dense({ units: this.actionSize, activation: "linear" }),
      ],
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: "meanSquaredError",
    });
    console.log(123, tf.getBackend());
    return model;
  }

  async act(state) {
    if (Math.random() <= this.epsilon) {
      return Math.floor(Math.random() * this.actionSize);
    }
    const pred = this.model.predict(state);
    return pred.argMax(1).dataSync()[0];
  }

  async remember(state, action, reward, nextState, done) {
    this.memory.push({ state, action, reward, nextState, done });
    if (this.memory.length > 2000) this.memory.shift();
  }

  async replay() {
    if (this.memory.length < config.batchSize) return;

    const batch = this.memory
      .sort(() => Math.random() - 0.5)
      .slice(0, config.batchSize);

    const states = tf.concat(batch.map((b) => b.state));
    const nextStates = tf.concat(batch.map((b) => b.nextState));

    const targets = this.model.predict(states);
    const nextQValues = this.targetModel.predict(nextStates);

    batch.forEach((b, i) => {
      const target = targets
        .dataSync()
        .slice(i * this.actionSize, (i + 1) * this.actionSize);
      if (b.done) {
        target[b.action] = b.reward;
      } else {
        target[b.action] =
          b.reward +
          this.gamma *
            Math.max(
              ...nextQValues
                .dataSync()
                .slice(i * this.actionSize, (i + 1) * this.actionSize)
            );
      }
      targets.dataSync().set(target, i * this.actionSize);
    });

    await this.model.fit(states, targets, {
      batchSize: config.batchSize,
      epochs: 1,
    });

    if (this.epsilon > config.epsilonMin) {
      this.epsilon *= config.epsilonDecay;
    }
  }

  updateTargetModel() {
    this.targetModel.setWeights(this.model.getWeights());
  }
}

// 数据处理器
class DataHandler {
  constructor() {
    this.exchange = new ccxt.binance({ enableRateLimit: true });
  }

  async loadData() {
    const ohlcv = await this.exchange.fetchOHLCV(
      config.symbol,
      config.timeframe,
      undefined,
      config.trainSize + 100
    );
    return this.processData(ohlcv);
  }

  async processData(ohlcv) {
    const closes = ohlcv.map((c) => c[4]);
    const volumes = ohlcv.map((v) => v[5]);

    // 计算技术指标
    const [rsi] = await tulind.indicators.rsi.indicator([closes], [14]);
    const [macd] = await tulind.indicators.macd.indicator(
      [closes],
      [12, 26, 9]
    );
    const [bbUpper] = await tulind.indicators.bbands.indicator(
      [closes],
      [20, 2]
    );

    // 构建数据集
    return ohlcv
      .map((candle, i) => ({
        time: candle[0],
        close: closes[i],
        rsi: rsi[i] || 0,
        macd: macd[i] || 0,
        bbUpper: bbUpper[i] || 0,
        volume: volumes[i],
      }))
      .filter((d) => d.rsi && d.macd && d.bbUpper);
  }

  normalizeData(data) {
    const means = {};
    // 计算统计量
    const stds = {};
    ["close", "rsi", "macd", "bbUpper", "volume"].forEach((col) => {
      const values = data.map((d) => d[col]);
      means[col] = tf.mean(values).dataSync()[0];
      stds[col] = tf.moments(values).variance.sqrt().dataSync()[0];
    });

    // 标准化处理
    return data.map((d) =>
      Object.assign(d, {
        close: (d.close - means.close) / stds.close,
        rsi: (d.rsi - means.rsi) / stds.rsi,
        macd: (d.macd - means.macd) / stds.macd,
        bbUpper: (d.bbUpper - means.bbUpper) / stds.bbUpper,
        volume: (d.volume - means.volume) / stds.volume,
      })
    );
  }

  createSequences(data) {
    const sequences = [];
    for (let i = config.windowSize; i < data.length; i++) {
      sequences.push(data.slice(i - config.windowSize, i));
    }
    return sequences;
  }
}

// 回测引擎
class Backtester {
  constructor(data) {
    this.data = data;
    this.balance = 10000;
    this.position = null;
    this.trades = [];
  }

  getState(step) {
    const seq = this.data
      .slice(step - config.windowSize, step)
      .map((d) => [d.close, d.rsi, d.macd, d.bbUpper, d.volume]);
    return tf.tensor3d([seq]);
  }

  executeAction(action, step) {
    const price = this.data[step].close;

    // 动作空间：0-持币 1-开多 2-开空
    if (action === 1 && !this.position) {
      this.position = {
        type: "long",
        entryPrice: price,
        size: this.balance * 0.1,
        step: step,
      };
    } else if (action === 2 && !this.position) {
      this.position = {
        type: "short",
        entryPrice: price,
        size: this.balance * 0.1,
        step: step,
      };
    } else if (action === 0 && this.position) {
      this.closePosition(price, step);
    }
  }

  closePosition(price, step) {
    let pnl = (price - this.position.entryPrice) / this.position.entryPrice;
    if (this.position.type === "short") pnl *= -1;

    this.balance += this.position.size * pnl;
    this.trades.push({
      entry: this.position.entryPrice,
      exit: price,
      pnl,
      duration: step - this.position.step,
    });
    this.position = null;
  }

  calculateReward() {
    if (this.trades.length === 0) return 0;

    const returns = this.trades.map((t) => t.pnl);
    const avgReturn = tf.mean(returns).dataSync()[0];
    const stdReturn = tf.moments(returns).variance.sqrt().dataSync()[0];

    return stdReturn !== 0 ? (avgReturn / stdReturn) * 100 : 0;
  }
}

// 主流程
async function main() {
  await tf.ready();
  // 初始化组件
  const dh = new DataHandler();
  const rawData = await dh.loadData();
  const normalizedData = dh.normalizeData(rawData);
  const sequences = dh.createSequences(normalizedData);

  const stateSize = 5; // close, rsi, macd, bbUpper, volume
  const actionSize = 3; // 0: hold, 1: long, 2: short

  const agent = new DQNAgent(stateSize, actionSize);
  const backtester = new Backtester(normalizedData);

  // 训练循环
  for (let episode = 0; episode < config.episodes; episode++) {
    for (let step = config.windowSize; step < normalizedData.length; step++) {
      const state = backtester.getState(step);
      const action = await agent.act(state);

      backtester.executeAction(action, step);

      const nextState = backtester.getState(step + 1);
      const reward = backtester.calculateReward();
      const done = step === normalizedData.length - 1;

      await agent.remember(state, action, reward, nextState, done);
      await agent.replay();

      state.dispose();
      nextState.dispose();

      if (done) break;
    }

    agent.updateTargetModel();
    console.log(
      `Episode ${episode + 1} | Balance: ${backtester.balance.toFixed(2)}`
    );
  }

  // 保存模型
  await agent.model.save("file://./doge-model");
}

main().catch(console.error);

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
