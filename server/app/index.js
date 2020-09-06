import request from '../utils/request';

const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');

const customAuthClient = require('./customAuthClient');

let myInterval;
let mode = 1; //下单模式
let continuousLossNum = 0; //连续亏损次数
let continuousWinNum = 0; //连续盈利次数
const timeoutNo = 1000 * 60 * 1; //下单间隔时间

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
    continuousWinNum = 0;
    continuousLossNum = 0;
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

app.get('/operation/changeMode', function(req, response) {
    const {query = {}} = req;
    mode = query.mode || 1;
    send(response, {errcode: 0, errmsg: '切换下单模式成功', data: { mode } });
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

app.get('/futures/autoCloseOrderByInstrumentId', function(req, response) {
    const {query = {}} = req;
    const { instrument_id, direction } = query;
    autoCloseOrderByInstrumentId({instrument_id, direction}).then(res=>{
        send(response, {errcode: 0, errmsg: 'ok', data: res });
    })
});

// 市价全平By instrument_id
const autoCloseOrderByInstrumentId =  async ({instrument_id, direction}) => {
    if(!direction){
        const { holding } = await authClient.futures().getPosition(instrument_id);
        direction = 'long';
        if(Number(holding[0].short_avail_qty)) direction = 'short'
    }
    const result = await cAuthClient
        .futures
        .closePosition({instrument_id, direction})
    return result;
}

// 市价全平By holding
const autoCloseOrderByHolding =  async ({ short_avail_qty, instrument_id }) => {
    let direction = 'long';
    if(Number(short_avail_qty)) direction = 'short'
    const result = await cAuthClient
        .futures
        .closePosition({instrument_id, direction})
    return result;
}


// 开仓，对冲仓或同方向仓
const autoOpenOrders = async (b, e, isReverse = false) => {
    const { holding: btc } = await authClient.futures().getPosition(b.instrument_id);
    const { holding: eos } = await authClient.futures().getPosition(e.instrument_id);
    const btcHolding = btc[0];
    const eosHolding = eos[0];

    const { mark_price: btcMarkPrice } = await cAuthClient.futures.getMarkPrice(b.instrument_id);
    const { mark_price: eosMarkPrice } = await cAuthClient.futures.getMarkPrice(e.instrument_id);

    // 可开张数
    const btcAvailNo = await getAvailNo();
    const eosAvailNo = await getAvailNo(10, 'eos-usd','eos-usd-201225');

    const btcAvail = Math.min(Number(btcAvailNo), Math.max(Number(b.long_avail_qty), Number(b.short_avail_qty)));
    const eosAvail = Math.min(Number(eosAvailNo), Math.max(Number(e.long_avail_qty), Number(e.short_avail_qty))) || (btcAvail * 10);

    const btcType = isReverse ? reverseDirection(getCurrentDirection(b)) : getCurrentDirection(b);
    const eosType = isReverse ? reverseDirection(getCurrentDirection(e)) : getCurrentDirection(e);

    console.log('avail',btcAvail, eosAvail)
    console.log(btcAvail,btcType,btcHolding.instrument_id)
    console.log(eosAvail,eosType,eosHolding.instrument_id)
    // 目前是空仓
    if(!Number(btcHolding.long_qty) && !Number(btcHolding.short_qty)){
        const payload = {
            size: Number(btcHolding.long_avail_qty) || Number(btcHolding.short_avail_qty),
            type: Number(btcPosition.long_avail_qty) ? 3 : 4,
            order_type: 1, //1：只做Maker 4：市价委托
            instrument_id: btcHolding.instrument_id,
            price: btcMarkPrice,
        }
        authClient
            .futures()
            .postOrder(payload);
    }

    if(!Number(eosHolding.long_qty) && !Number(eosHolding.short_qty)){
        const eosPayload = {
            size: Number(eosHolding.long_avail_qty) || Number(eosHolding.short_avail_qty),
            type: Number(eosHolding.long_avail_qty) ? 3 : 4,
            order_type: 1, //1：只做Maker 4：市价委托
            instrument_id: eosHolding.instrument_id,
            price: eosMarkPrice,
        }
        await authClient
            .futures()
            .postOrder(eosPayload);
    }

    startInterval();
}

// 平仓
const autoCloseOrders = async (btcHolding, eosHolding) => {
    // autoCloseOrderByHolding(btcHolding);
    // autoCloseOrderByHolding(eosHolding);
    const { mark_price: btcMarkPrice } = await cAuthClient.futures.getMarkPrice(btcHolding.instrument_id);
    const { mark_price: eosMarkPrice } = await cAuthClient.futures.getMarkPrice(eosHolding.instrument_id);

    const payload = {
        size: Number(btcHolding.long_avail_qty) || Number(btcHolding.short_avail_qty),
        type: Number(btcPosition.long_avail_qty) ? 3 : 4,
        order_type: 1, //1：只做Maker 4：市价委托
        instrument_id: btcHolding.instrument_id,
        price: btcMarkPrice,
    }
    authClient
        .futures()
        .postOrder(payload);

    const eosPayload = {
        size: Number(eosHolding.long_avail_qty) || Number(eosHolding.short_avail_qty),
        type: Number(eosHolding.long_avail_qty) ? 3 : 4,
        order_type: 1, //1：只做Maker 4：市价委托
        instrument_id: eosHolding.instrument_id,
        price: eosMarkPrice,
    }
    authClient
        .futures()
        .postOrder(eosPayload);

    stopInterval();
}

function autoCloseOrderSingle(holding) {
    const payload = {
        size: Number(holding.long_avail_qty),
        type: 3,
        order_type: 4, //市价委托
        instrument_id: holding.instrument_id
    }
    authClient
        .futures()
        .postOrder(payload);
}

// 获取可开张数
const getAvailNo = async (val = 100, currency = 'btc-usd', instrument_id = 'btc-usd-201225') => {
    const { equity } = await authClient.futures().getAccounts(currency);
    const { mark_price } = await cAuthClient.futures.getMarkPrice(instrument_id);
    const { leverage } = await authClient.futures().getLeverage(currency);

    return Math.floor(Number(equity) * Number(mark_price) * Number(leverage) * 0.97 / val) || 0;
}

// 合约费率
app.get('/futures/getTradeFee', function(req, response) {
    cAuthClient.futures.getTradeFee().then(res=>{
        send(response, {errcode: 0, errmsg: 'ok', data: res });
    })
});

// 当前持仓方向
function getCurrentDirection(holding) {
    let direction = 1; // 多
    if(Number(holding.short_qty)) direction = 2; // 空
    return direction;
}

// 方向反向
function reverseDirection(direction) {
    let newDirection;
    if(direction==1) newDirection = 2;
    if(direction==2) newDirection = 1;
    return newDirection;
}

// 检测某币持仓盈亏
function validateRatio(holding) {

}

// 下单模式
function getOrderMode(mode = 1, radio, btcHolding, eosHolding) {
    console.log('mode',mode,radio,btcHolding,eosHolding)
    if(mode == 1){
        if(radio > (Number(btcHolding.leverage) + Number(eosHolding.leverage)) / 2 / 100){
            autoCloseOrders(btcHolding, eosHolding);
            // 盈利后再开仓
            continuousLossNum = 0;
            continuousWinNum++;
            // 连续盈利3次，不再开仓
            if(continuousWinNum<3){
                setTimeout(()=>{
                    autoOpenOrders(btcHolding, eosHolding);
                },timeoutNo)
            }
        }else if(radio < -(Number(btcHolding.leverage) + Number(eosHolding.leverage)) / 4 / 100){
            autoCloseOrders(btcHolding, eosHolding);
            continuousLossNum++;
            continuousWinNum = 0;
            // 连续亏损2次后，反向开仓，亏损3次，不再开仓
            let isReverse = false;
            if(continuousLossNum<3) {
                // if(continuousLossNum==2) isReverse = true;
                setTimeout(()=>{
                    autoOpenOrders(btcHolding, eosHolding, isReverse);
                },timeoutNo)
            }
        }
        return;
    }
    // if(mode == 2) {
    //     const btcSingleRatio = (Number(btcHolding.long_avail_qty) && Number(btcHolding.long_pnl_ratio)) +
    //         (Number(btcHolding.short_avail_qty) && Number(btcHolding.short_pnl_ratio));
    //     if(btcSingleRatio > Number(btcHolding.leverage) / 100) {
    //         autoCloseOrderSingle(btcHolding);
    //         continuousLossNum = 0;
    //     };
    //
    //     const eosSingleRatio = (Number(eosHolding.long_avail_qty) && Number(eosHolding.long_pnl_ratio)) +
    //         (Number(eosHolding.short_avail_qty) && Number(btcHolding.short_pnl_ratio));
    //     if(eosSingleRatio > Number(eosHolding.leverage) / 100) {
    //         autoCloseOrderSingle(eosHolding);
    //         continuousLossNum = 0;
    //     };
    //
    //     if( (btcSingleRatio + eosSingleRatio) < -(Number(btcHolding.leverage) + Number(eosHolding.leverage)) * 2 / 4 / 3 / 100 ) {
    //         autoCloseOrders(btcHolding, eosHolding);
    //         continuousLossNum++;
    //
    //         // 连续亏损2次后，反向开仓，亏损3次，不再开仓
    //         let isReverse = false;
    //         if(continuousLossNum<3) {
    //             if(continuousLossNum==2) isReverse = true;
    //             setTimeout(()=>{
    //                 autoOpenOrders(btcHolding, eosHolding, isReverse);
    //             },timeoutNo)
    //         }
    //     }
    //
    //     return;
    // }
}

function startInterval() {
    if(myInterval) {
        stopInterval();
        setTimeout(()=>{
            startInterval();
        },1000*3);
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
        if(!qty) return;
        getOrderMode(mode, radio, btcHolding[0], eosHolding[0]);
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
