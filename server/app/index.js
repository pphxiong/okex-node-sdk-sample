import request from '../utils/request';

const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');

const customAuthClient = require('./customAuthClient');

let myInterval;
let mode = 2; //下单模式
let continuousLossNum = 0; //连续亏损次数
let continuousWinNum = 0; //连续盈利次数
let continuousBatchNum = 0; //连续补仓次数
const timeoutNo = 1000 * 60 * 5; //下单间隔时间

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
    const {instrument_id, limit} = query; // "BTC-USD-200821"
    authClient
        .futures()
        .getOrders(instrument_id, {state: 2, limit})
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

// 逐仓模式
app.get('/futures/postLeverage', function(req, response) {
    const {query = {}} = req;
    const { underlying, leverage, direction, instrument_id } = query;
    authClient
        .futures()
        .postLeverage(underlying, { leverage, direction, instrument_id })
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
  // startInterval();
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
    const btcAvailNo = await getAvailNo({ mark_price: btcMarkPrice });
    const eosAvailNo = await getAvailNo({ val: 10, currency: 'EOS-USD', instrument_id: 'EOS-USD-201225', mark_price: eosMarkPrice });

    const btcAvail = Math.min(Number(btcAvailNo), Math.max(Number(b.long_avail_qty), Number(b.short_avail_qty)));
    const eosAvail = Math.min(Number(eosAvailNo), Math.max(Number(e.long_avail_qty), Number(e.short_avail_qty))) || (btcAvail * 10);

    const btcType = isReverse ? reverseDirection(getCurrentDirection(b)) : getCurrentDirection(b);
    const eosType = isReverse ? reverseDirection(getCurrentDirection(e)) : getCurrentDirection(e);

    console.log('avail',btcAvail, eosAvail)
    console.log(btcHolding.instrument_id,btcAvail,btcType)
    console.log(eosHolding.instrument_id,eosAvail,eosType)
    // 目前是空仓，且可开张数不为0
    if(!Number(btcHolding.long_qty) && !Number(btcHolding.short_qty) && btcAvail){
        const payload = {
            size: btcAvail,
            type: btcType,
            order_type: 0, //1：只做Maker 4：市价委托
            instrument_id: btcHolding.instrument_id,
            price: btcMarkPrice,
            match_price: 0
        }
        authClient
            .futures()
            .postOrder(payload);
    }

    if(!Number(eosHolding.long_qty) && !Number(eosHolding.short_qty) && eosAvail){
        const eosPayload = {
            size: eosAvail,
            type: eosType,
            order_type: 0, //1：只做Maker 4：市价委托
            instrument_id: eosHolding.instrument_id,
            price: eosMarkPrice,
            match_price: 0
        }
        await authClient
            .futures()
            .postOrder(eosPayload);
    }

    myInterval = startInterval();
}

// 平仓
const autoCloseOrders = async (btcHolding, eosHolding) => {
    // autoCloseOrderByHolding(btcHolding);
    // autoCloseOrderByHolding(eosHolding);
    const { mark_price: btcMarkPrice } = await cAuthClient.futures.getMarkPrice(btcHolding.instrument_id);
    const { mark_price: eosMarkPrice } = await cAuthClient.futures.getMarkPrice(eosHolding.instrument_id);

    if(Number(btcHolding.long_avail_qty) || Number(btcHolding.short_avail_qty)){
        const payload = {
            size: Number(btcHolding.long_avail_qty) || Number(btcHolding.short_avail_qty),
            type: Number(btcHolding.long_avail_qty) ? 3 : 4,
            order_type: 0, //1：只做Maker 4：市价委托
            instrument_id: btcHolding.instrument_id,
            price: btcMarkPrice,
            match_price: 0
        }
        authClient
            .futures()
            .postOrder(payload);
    }

    if(Number(eosHolding.long_avail_qty) || Number(eosHolding.short_avail_qty)){
        const eosPayload = {
            size: Number(eosHolding.long_avail_qty) || Number(eosHolding.short_avail_qty),
            type: Number(eosHolding.long_avail_qty) ? 3 : 4,
            order_type: 0, //1：只做Maker 4：市价委托
            instrument_id: eosHolding.instrument_id,
            price: eosMarkPrice,
            match_price: 0
        }
        authClient
            .futures()
            .postOrder(eosPayload);
    }
}

// availRatio开仓比例
const autoOpenOrderSingle = async (holding, { isReverse = false, availRatio = 1 }) => {
    const { instrument_id, long_avail_qty, short_avail_qty } = holding;
    const { mark_price } = await cAuthClient.futures.getMarkPrice(instrument_id);
    // 可开张数
    let availNo;
    let avail = 0;

    if(instrument_id.includes('BTC')){
        availNo = await getAvailNo({ mark_price });
    }else{
        availNo = await getAvailNo({ val: 10, currency: 'EOS-USD', instrument_id: 'EOS-USD-201225', mark_price });
    }
    avail = Math.min(Math.floor(Number(availNo) * availRatio), Math.max(Number(long_avail_qty), Number(short_avail_qty)));

    const type = isReverse ? reverseDirection(getCurrentDirection(holding)) : getCurrentDirection(holding);

    console.log('availNo', availNo, 'avail', avail, 'type', type)
    if(avail) {
        const payload = {
            size: avail,
            type,
            order_type: 0, //1：只做Maker 4：市价委托
            instrument_id: instrument_id,
            price: mark_price,
            match_price: 0
        }
        return authClient
            .futures()
            .postOrder(payload);
    }
    return new Promise(resolve=>{ resolve({ result: false }) })
}

const autoCloseOrderSingle = async ({ long_avail_qty, short_avail_qty, instrument_id, last }) => {
    const payload = {
        size: Number(long_avail_qty) || Number(short_avail_qty),
        type: Number(long_avail_qty) ? 3 : 4,
        order_type: 0,
        instrument_id: instrument_id,
        price: last,
        match_price: 0
    }
    await authClient
        .futures()
        .postOrder(payload);
}

// 获取可开张数
const getAvailNo = async ({val = 100, currency = 'BTC-USD', instrument_id = 'BTC-USD-201225', mark_price}) => {
    const result = await authClient.futures().getAccounts(currency);
    const { equity, contracts, total_avail_balance } = result;
    const { margin_frozen, margin_for_unfilled } = contracts[0];
    const available_qty = Number(equity) - Number(margin_frozen) - Number(margin_for_unfilled);
    console.log('availResult', result)
    console.log('equity', equity, 'margin_frozen', margin_frozen, 'margin_for_unfilled', margin_for_unfilled)
    console.log('available_qty', available_qty)
    console.log('total_avail_balance', total_avail_balance)
    if(!mark_price) {
        const result = await cAuthClient.futures.getMarkPrice(instrument_id);
        mark_price = result.mark_price;
    }
    const leverageResult = await authClient.futures().getLeverage(currency);
    const { long_leverage } = leverageResult[instrument_id];

    return Math.floor(Number(total_avail_balance) * Number(mark_price) * Number(long_leverage) * 0.98 / val) || 0;
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
function getOrderMode(orderMode = 2, btcHolding, eosHolding) {
    const btcRatio = (Number(btcHolding.long_avail_qty) && Number(btcHolding.long_pnl_ratio)) +
        (Number(btcHolding.short_avail_qty) && Number(btcHolding.short_pnl_ratio));
    const eosRatio = (Number(eosHolding.long_avail_qty) && Number(eosHolding.long_pnl_ratio)) +
        (Number(eosHolding.short_avail_qty) && Number(eosHolding.short_pnl_ratio));

    const btcLeverage = Math.max(Number(btcHolding.long_margin), Number(btcHolding.short_margin)) ? Number(btcHolding.long_leverage) : 0;
    const eosLeverage = Math.max(Number(eosHolding.long_margin), Number(eosHolding.short_margin)) ? Number(eosHolding.long_leverage) : 0;
    const totalLeverage = btcLeverage + eosLeverage;
    const num = (btcLeverage ? 1 : 0) + (eosLeverage ? 1 : 0);
    let condition = totalLeverage / num / 100;
    // 对冲仓
    if(num == 2 && ((Number(btcHolding.long_margin) && Number(eosHolding.short_margin)) || (Number(btcHolding.short_margin) && Number(eosHolding.long_margin))) ) {
        condition = totalLeverage / num / 100 * 2 / 3;
    }
    console.log('btcRatio',btcRatio)
    console.log('eosRatio',eosRatio)
    console.log('condition',condition)
    console.log('mode',mode)
    if(orderMode == 1) {
        if(btcRatio + eosRatio > condition){
            autoCloseOrders(btcHolding, eosHolding);
            // 盈利后再开仓
            continuousLossNum = 0;
            continuousWinNum = continuousWinNum + 1;
            console.log('totalLeverage',totalLeverage)
            console.log('continuousLossNum',continuousLossNum)
            console.log('continuousWinNum',continuousWinNum)
            // 连续盈利3次，反向开仓
            if(continuousWinNum>2) {
                autoOpenOrders(btcHolding, eosHolding, true);
                continuousLossNum = 0;
                continuousWinNum = 0;
                return;
            }
            setTimeout(()=>{
                autoOpenOrders(btcHolding, eosHolding);
            },timeoutNo)
        }else if(btcRatio + eosRatio < - condition / 2){
            autoCloseOrders(btcHolding, eosHolding);
            continuousWinNum = 0;
            continuousLossNum = continuousLossNum + 1;
            console.log('totalLeverage',totalLeverage)
            console.log('continuousLossNum',continuousLossNum)
            console.log('continuousWinNum',continuousWinNum)
            // 连续亏损3次，反向立即开仓
            if(continuousLossNum>2) {
                autoOpenOrders(btcHolding, eosHolding, true);
                continuousLossNum = 0;
                continuousWinNum = 0;
                return;
            }
            setTimeout(()=>{
                autoOpenOrders(btcHolding, eosHolding);
            },timeoutNo)
        }
        return;
    }
    if(orderMode == 2){
        if(Number(btcHolding.long_margin) || Number(btcHolding.short_margin)) autoOperateByHolding(btcHolding,btcRatio,condition)
        if(Number(eosHolding.long_margin) || Number(eosHolding.short_margin)) autoOperateByHolding(eosHolding,eosRatio,condition)
    }
}

const autoOperateByHolding = async (holding,ratio,condition) => {
    console.log('continuousBatchNum', continuousBatchNum)
    // 补仓后，回本即平仓
    if(ratio > condition || (continuousBatchNum && (ratio > 0.02 * continuousBatchNum) )){
        continuousBatchNum = 0;
        continuousLossNum = 0;
        await autoCloseOrderSingle(holding)
        setTimeout(async ()=>{
            await autoOpenOrderSingle(holding);
        },timeoutNo)
        return;
    }
    if(ratio < - condition * 1.5){
        // 没有补过仓
        if(!continuousBatchNum) {
            // 补仓
            const { result } = await autoOpenOrderSingle(holding);
            if(result) {
                continuousBatchNum = continuousBatchNum + 1;
            }else{
                await autoCloseOrderSingle(holding);
            }
            console.log('result', result)
            return;
        }
        // 补过仓，平仓并再开半仓
        continuousBatchNum = 0;
        await autoCloseOrderSingle(holding);
        continuousLossNum = continuousLossNum + 1;
        // 连续亏损2次，反向
        let isReverse = false;
        if(continuousLossNum>1) isReverse = true;
        setTimeout(async ()=>{
            await autoOpenOrderSingle(holding,{ availRatio: 0.5, isReverse });
        },timeoutNo)
        return;
    }
}

function startInterval() {
    if(myInterval) return myInterval;
    return setInterval(async ()=>{
        const { holding: btcHolding } = await authClient.futures().getPosition('BTC-USD-201225');
        const { holding: eosHolding } = await authClient.futures().getPosition('EOS-USD-201225');

        const qty = Number(btcHolding[0].long_avail_qty) + Number(btcHolding[0].short_avail_qty) + Number(eosHolding[0].long_avail_qty) + Number(eosHolding[0].short_avail_qty)
        if(!qty) return;
        getOrderMode(mode, btcHolding[0], eosHolding[0]);
    },1000 * 5)
}

function stopInterval() {
    if(myInterval) {
        clearInterval(myInterval);
        myInterval = null;
        continuousLossNum = 0;
        continuousWinNum = 0;
    }
}

// 定时获取交割合约账户信息
myInterval = startInterval()
app.listen(8090);

console.log('server start');
