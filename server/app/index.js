import request from '../utils/request';

const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');

const customAuthClient = require('./customAuthClient');

let myInterval;

var config = require('./config');
const pClient = new PublicClient(config.urlHost);
const authClient = new AuthenticatedClient(
  config.httpkey,
  config.httpsecret,
  config.passphrase,
  config.urlHost
);
const cAuthClient = new customAuthClient(
    config.httpkey,
    config.httpsecret,
    config.passphrase,
    config.urlHost
)

var express = require('express');
// var http = require('../utils/http');
var app = express();

function send(res, ret) {
  var str = JSON.stringify(ret);
  res.send(str);
}

//测试
app.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'X-Requested-With');
  res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');
  res.header('X-Powered-By', ' 3.2.1');
  res.header('Content-Type', 'application/json;charset=utf-8');
  next();
});

app.get('/test', function(req, res) {
  send(res, {errcode: 0, errmsg: 'ok'});
});

app.get('/account/getCurrencies', function(req, response) {
  authClient
    .account()
    .getCurrencies()
    .then(res => {
      send(response, {errcode: 0, errmsg: 'ok', data: res});
    });
});

app.get('/account/getWallet', function(req, response) {
  const {query = {}} = req;
  const {currency} = query.params || query;
  authClient
    .account()
    .getWallet(currency)
    .then(res => {
      send(response, {errcode: 0, errmsg: 'ok', data: res});
    });
});


app.get('/account/getAssetValuation', function(req, response) {
    const {query = {}} = req;
    const { type = 3, } = query;
    cAuthClient.account.getAssetValuation(type)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/futures/getOrders', function(req, response) {
    const {query = {}} = req;
    const {instrument_id} = query; // "BTC-USD-200821"
    authClient
        .futures()
        .getOrders(instrument_id, {state: 2, limit: 20})
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/futures/getAccounts', function(req, response) {
  const {query = {}} = req;
  const {currency} = query; // "BTC-USD"
  authClient
    .futures()
    .getAccounts(currency)
    .then(res => {
      send(response, {errcode: 0, errmsg: 'ok', data: res});
    });
});

app.get('/futures/getMarkPrice', function(req, response) {
    const {query = {}} = req;
    const {instrument_id} = query;
    cAuthClient
        .futures
        .getMarkPrice(instrument_id)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/futures/information/', function(req, response) {
  const {query = {}} = req;
  const {currency} = query.params || query;
  request
    .get(`${config.urlHost}/api/information/v3/${currency}/long_short_ratio`)
    .then(res => {
      send(response, {errcode: 0, errmsg: 'ok', data: res});
    });
});

app.get('/futures/information/sentiment', function(req, response) {
  const {query = {}} = req;
  const {currency} = query.params || query;
  request
    .get(`${config.urlHost}/api/information/v3/${currency}/sentiment`)
    .then(res => {
      send(response, {errcode: 0, errmsg: 'ok', data: res});
    });
});

// 全仓模式
app.get('/futures/postLeverage', function(req, response) {
    const {query = {}} = req;
    const { underlying, leverage } = query;
    authClient
        .futures()
        .postLeverage(underlying, { leverage })
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/futures/getLeverage', function(req, response) {
    const {query = {}} = req;
    const { underlying } = query;
    authClient
        .futures()
        .getLeverage(underlying)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

// 逐仓模式
app.get('/futures/postSingleLeverage', function(req, response) {
  const {query = {}} = req;
  const {underlying, leverage} = query;
  authClient
    .futures()
    .postLeverage(underlying, query)
    .then(res => {
      send(response, {errcode: 0, errmsg: 'ok', data: res});
    });
});

app.get('/futures/postOrder', function(req, response) {
    const {query = {}} = req;
    authClient
        .futures()
        .postOrder(query)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/postLeverage', function(req, response) {
  const {query = {}} = req;
  const {instrument_id, leverage, side} = query;
  authClient
    .swap()
    .postLeverage(instrument_id, {leverage, side})
    .then(res => {
      send(response, {errcode: 0, errmsg: 'ok', data: res});
    });
});

app.get('/swap/postOrder', function(req, response) {
  const {query = {}} = req;
  authClient
    .swap()
    .postOrder(query)
    .then(res => {
      send(response, {errcode: 0, errmsg: 'ok', data: res});
    });
  startInterval();
});

app.get('/swap/getAccount', function(req, response) {
  const {query = {}} = req;
  const { instrument_id } = query;
  authClient
      .swap()
      .getAccount(instrument_id)
      .then(res => {
        send(response, {errcode: 0, errmsg: 'ok', data: res});
      });
});

app.get('/futures/getPosition', function(req, response) {
    const {query = {}} = req;
    const { instrument_id } = query;
    authClient
        .futures()
        .getPosition(instrument_id)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/operation/startMonitor', function(req, response) {
    if(!myInterval){
        myInterval = startInterval();
    }
    send(response, {errcode: 0, errmsg: '开始监控成功', data: {} });
});

app.get('/operation/stopMonitor', function(req, response) {
    stopInterval();
    send(response, {errcode: 0, errmsg: '停止监控成功', data: {} });
});

// 开仓，对冲仓或同方向仓
const autoOpenOrders = async (btcHolding, eosHolding, isReverse = false) => {
    // 可开张数
    const btcAvailNo = await getAvailNo();
    const eosAvailNo = await getAvailNo(10, 'eos-usd','eos-usd-201225');

    const btcAvail = Math.min(Number(btcAvailNo), Math.max(Number(btcHolding.long_avail_qty), Number(btcHolding.short_avail_qty)));
    const eosAvail = Math.min(Number(eosAvailNo), Math.max(Number(eosHolding.long_avail_qty), Number(eosHolding.short_avail_qty)));

    const btcType = isReverse ? reverseDirection(getCurrentDirection(btcHolding)) : getCurrentDirection(btcHolding);
    const eosType = isReverse ? reverseDirection(getCurrentDirection(eosHolding)) : getCurrentDirection(eosHolding);

    const payload = {
        size: btcAvail,
        type: btcType,
        order_type: 4, //市价委托
        instrument_id: btcHolding.instrument_id
    }
    authClient
        .futures()
        .postOrder(payload);


    const eosPayload = {
        size: eosAvail,
        type: eosType,
        order_type: 4, //市价委托
        instrument_id: eosHolding.instrument_id
    }
    authClient
        .futures()
        .postOrder(eosPayload);

    startInterval();
}

// 市价全平
function autoCloseOrdersAll() {

}

// 平仓
function autoCloseOrders(btcHolding, eosHolding) {
    if(Number(btcHolding.long_avail_qty)) {
        const payload = {
            size: Number(btcHolding.long_avail_qty),
            type: 3,
            order_type: 4, //市价委托
            instrument_id: btcHolding.instrument_id
        }
        authClient
            .futures()
            .postOrder(payload);
    }

    if(Number(btcHolding.short_avail_qty)) {
        const payload = {
            size: Number(btcHolding.short_avail_qty),
            type: 4,
            order_type: 4, //市价委托
            instrument_id: btcHolding.instrument_id
        }
        authClient
            .futures()
            .postOrder(payload);
    }

    if(Number(eosHolding.short_avail_qty)){
        const eosPayload = {
            size: Number(eosHolding.short_avail_qty),
            type: 4,
            order_type: 4, //市价委托
            instrument_id: eosHolding.instrument_id
        }
        authClient
            .futures()
            .postOrder(eosPayload);
    }

    if(Number(eosHolding.long_avail_qty)){
        const eosPayload = {
            size: Number(eosHolding.long_avail_qty),
            type: 3,
            order_type: 4, //市价委托
            instrument_id: eosHolding.instrument_id
        }
        authClient
            .futures()
            .postOrder(eosPayload);
    }

    stopInterval();
}

// 获取可开张数
const getAvailNo = async (val = 100, currency = 'btc-usd', instrument_id = 'btc-usd-201225') => {
    const { equity } = await authClient.futures().getAccounts(currency);
    const {  mark_price } = await cAuthClient.futures.getMarkPrice(instrument_id);
    const { leverage } = await authClient.futures().getLeverage(currency);

    return Math.floor(Number(equity) * Number(mark_price) * Number(leverage) * 0.97 / val)
}

// 当前持仓方向
function getCurrentDirection(holding) {
    let direction = 1; // 多
    if(Number(holding.short_avail_qty)) direction = 2; // 空
    return direction;
}

// 方向反向
function reverseDirection(direction) {
    let newDirection;
    if(direction==1) newDirection = 2;
    if(direction==2) newDirection = 1;
    return newDirection;
}

let continuousLossNum = 0;
function startInterval() {
    if(myInterval) {
        stopInterval();
        setTimeout(()=>{
            startInterval();
        },1000*2);
        return;
    }
    return setInterval(async ()=>{
        const { holding: btcHolding } = await authClient.futures().getPosition('BTC-USD-201225');
        const { holding: eosHolding } = await authClient.futures().getPosition('EOS-USD-201225');

        const qty = Number(btcHolding[0].long_avail_qty) + Number(btcHolding[0].short_avail_qty) + Number(eosHolding[0].long_avail_qty) + Number(eosHolding[0].short_avail_qty)
        const radio =
            (Number(btcHolding[0].long_avail_qty) && Number(btcHolding[0].long_pnl_ratio)) +
            (Number(btcHolding[0].short_avail_qty) && Number(btcHolding[0].short_pnl_ratio)) +
            (Number(eosHolding[0].long_avail_qty) && Number(eosHolding[0].long_pnl_ratio)) +
            (Number(eosHolding[0].short_avail_qty) && Number(eosHolding[0].short_pnl_ratio));
        console.log('收益率：',radio);
        if(!qty) return;
        if(radio > 0.098){
            autoCloseOrders(btcHolding[0], eosHolding[0]);
            // 盈利后，1分钟后再开仓
            continuousLossNum = 0;
            setTimeout(()=>{
                autoOpenOrders(btcHolding[0], eosHolding[0]);
            },1000*60*1)
        }else if(radio < -0.112){
            autoCloseOrders(btcHolding[0], eosHolding[0]);
            continuousLossNum++;
            // 连续亏损两次后，不再开仓
            if(continuousLossNum<2) {
                setTimeout(()=>{
                    autoOpenOrders(btcHolding[0], eosHolding[0], true);
                },1000*60*1)
            }
        }
    },1000 * 5)
}

function stopInterval() {
    if(myInterval) {
        clearInterval(myInterval);
        myInterval = null;
    }
}

// 定时获取交割合约账户信息
myInterval = startInterval()
app.listen(8090);

console.log('server start');
