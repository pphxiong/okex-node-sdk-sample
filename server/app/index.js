import request from '../utils/request';

const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');

let myInterval;

var config = require('./config');
const pClient = new PublicClient(config.urlHost);
const authClient = new AuthenticatedClient(
  config.httpkey,
  config.httpsecret,
  config.passphrase,
  config.urlHost
);

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
function autoOpenOrders(longHolding, shortHolding, btcType = 1, eosType = 2) {
    const payload = {
        size: Number(longHolding.long_avail_qty),
        type: btcType,
        order_type: 4, //市价委托
        instrument_id: longHolding.instrument_id
    }
    authClient
        .futures()
        .postOrder(payload);
    const eosPayload = {
        size: Number(shortHolding.short_avail_qty),
        type: eosType,
        order_type: 4, //市价委托
        instrument_id: shortHolding.instrument_id
    }
    authClient
        .futures()
        .postOrder(eosPayload);

    startInterval();
}

// 平仓
function autoCloseOrders(longHolding, shortHolding) {
    if(Number(longHolding.long_avail_qty)) {
        const payload = {
            size: Number(longHolding.long_avail_qty),
            type: 3,
            order_type: 4, //市价委托
            instrument_id: longHolding.instrument_id
        }
        authClient
            .futures()
            .postOrder(payload);
    }

    if(Number(shortHolding.short_avail_qty)){
        const eosPayload = {
            size: Number(shortHolding.short_avail_qty),
            type: 4,
            order_type: 4, //市价委托
            instrument_id: shortHolding.instrument_id
        }
        authClient
            .futures()
            .postOrder(eosPayload);
    }

    if(Number(shortHolding.long_avail_qty)){
        const eosPayload = {
            size: Number(shortHolding.long_avail_qty),
            type: 3,
            order_type: 4, //市价委托
            instrument_id: shortHolding.instrument_id
        }
        authClient
            .futures()
            .postOrder(eosPayload);
    }

    stopInterval();
}

function startInterval() {
    if(myInterval) {
        stopInterval();
        setTimeout(()=>{
            startInterval();
        },1000*2);
    }
    return setInterval(()=>{
        authClient
            .futures()
            .getPosition('BTC-USD-201225')
            .then(res => {
                const { holding } = res;
                return holding[0];
            })
            .then(longHolding=>{
                authClient.futures().getPosition('EOS-USD-201225')
                    .then(res=>{
                        const { holding } = res;
                        const radio = Number(longHolding.long_pnl_ratio) + Number(longHolding.short_pnl_ratio) + Number(holding[0].long_pnl_ratio) + Number(holding[0].short_pnl_ratio);
                        console.log(longHolding);
                        console.log(holding[0]);
                        console.log('收益率：',radio);
                        if(radio > 0.082){
                            autoCloseOrders(longHolding, holding[0]);
                            // 盈利后，1分钟后再开仓
                            setTimeout(()=>{
                                autoOpenOrders(longHolding, holding[0]);
                            },1000*60*1)
                        }else if(radio < -0.16){
                            autoCloseOrders(longHolding, holding[0]);
                            if(Number(longHolding.long_avail_qty) && Number(holding[0].short_avail_qty)) {
                                // 亏损并且是对冲仓时，5分钟后开两个多仓
                                setTimeout(()=>{
                                    autoOpenOrders(longHolding, holding[0], 1, 1);
                                },1000*60*5)
                            }
                        }
                        // if(Number(longHolding.long_avail_qty) && Number(holding[0].short_avail_qty)){
                        //     if(radio > 0.082){
                        //         autoCloseOrders(longHolding, holding[0]);
                        //         // 1分钟后再开仓
                        //         setTimeout(()=>{
                        //             autoOpenOrders(longHolding, holding[0]);
                        //         },1000*60*1)
                        //     }else if(radio < -0.16){
                        //         autoCloseOrders(longHolding, holding[0]);
                        //         // 亏损后，5分钟后向同方向开仓
                        //         setTimeout(()=>{
                        //             autoOpenOrders(longHolding, holding[0], 1, 1);
                        //         },1000*60*5)
                        //     }
                        // }else{
                        //     autoCloseOrders(longHolding, holding[0]);
                        // }
                    })
            });
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
