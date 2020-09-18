import request from '../utils/request';
import moment from 'moment'

const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');

const customAuthClient = require('./customAuthClient');

let BTC_INSTRUMENT_ID = "BTC-USD-201225";
let EOS_INSTRUMENT_ID = "EOS-USD-201225";
let myInterval;
let mode = 3; //下单模式
let continuousLossNum = 0; //连续亏损次数
let continuousWinNum = 0; //连续盈利次数
let continuousBatchNum = 0; //连续补仓次数
const continuousMap = {
    [BTC_INSTRUMENT_ID]: {
        continuousLossNum: 0,
        continuousWinNum: 0,
        continuousBatchNum: 0,
        continuousProfitNum: 0,
    },
    [EOS_INSTRUMENT_ID]: {
        continuousLossNum: 0,
        continuousWinNum: 0,
        continuousBatchNum: 0,
        continuousProfitNum: 0,
    },
};
const lastOrderMap = {
    [BTC_INSTRUMENT_ID]: {
        last: 0, //上次成交价格
        type: 1, //类型
    },
    [EOS_INSTRUMENT_ID]: {
        last: 0,
        type: 1,
    },
}
const timeoutNo = 1000 * 60 * 1; //下单间隔时间
let frequency = 1; //交易频次
const batchOrderMap = {
    [BTC_INSTRUMENT_ID]: {
        order_id: 0, //上次补仓订单id
    },
    [EOS_INSTRUMENT_ID]: {
        order_id: 0
    },
}
const winOrderMap = {
    [BTC_INSTRUMENT_ID]: {
        order_id: 0, //上次止盈订单id
    },
    [EOS_INSTRUMENT_ID]: {
        order_id: 0
    },
}

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
    const {instrument_id, limit, state = 2} = query; // "BTC-USD-200821"
    authClient
        .futures()
        .getOrders(instrument_id, {state, limit})
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
    myInterval = startInterval();
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

app.get('/operation/setFrequency', function(req, response) {
    const {query = {}} = req;
    const { frequency: customFrequency } = query;
    frequency = customFrequency || 1;
    send(response, {errcode: 0, errmsg: '设置交易频次成功', data: { frequency } });
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
        if(Number(holding[0].short_qty)) direction = 'short'
    }
    const result = await cAuthClient
        .futures
        .closePosition({instrument_id, direction})
    return result;
}

// 市价全平By holding
const autoCloseOrderByMarketPriceByHolding =  async ({ short_qty, instrument_id }) => {
    let direction = 'long';
    if(Number(short_qty)) direction = 'short'
    await validateAndCancelOrder(instrument_id);
    return await cAuthClient.futures.closePosition({instrument_id, direction})
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
    const eosAvailNo = await getAvailNo({ val: 10, currency: 'EOS-USD', instrument_id: EOS_INSTRUMENT_ID, mark_price: eosMarkPrice });

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

// 检测是否有未成交的挂单， state：2 完全成交， 6： 未完成， 7： 已完成
// 如果有就撤销
const validateAndCancelOrder = async (instrument_id) => {
    const { result, order_info } = await authClient.futures().getOrders(instrument_id, {state: 6, limit: 1})
    console.log('cancelorder', instrument_id, result)
    if( result && order_info && order_info.length ){
        const { order_id } = order_info[0];
        return await authClient.futures().cancelOrder(instrument_id,order_id)
    }
    return new Promise(resolve=>{ resolve({ result: false }) })
}

// 下单，并返回订单信息
const getOrderState = async (payload) => {
    const { instrument_id } = payload;
    const { order_id } = await authClient.futures().postOrder(payload);
    return await authClient.futures().getOrder(instrument_id,order_id)
}

// 开仓，availRatio开仓比例
const autoOpenOrderSingle = async (holding, params = {}) => {
    const { isReverse = false, availRatio = 1 } = params;
    const { instrument_id, long_avail_qty, short_avail_qty } = holding;
    const { mark_price } = await cAuthClient.futures.getMarkPrice(instrument_id);
    // 可开张数
    let availNo;
    let avail = 0;

    if(instrument_id.includes('BTC')){
        availNo = await getAvailNo({ mark_price });
    }else{
        availNo = await getAvailNo({ val: 10, currency: 'EOS-USD', instrument_id: EOS_INSTRUMENT_ID, mark_price });
    }
    avail = Math.min(Math.floor(Number(availNo) * availRatio), Math.max(Number(long_avail_qty), Number(short_avail_qty)));

    const type = isReverse ? reverseDirection(getCurrentDirection(holding)) : getCurrentDirection(holding);

    console.log('moment', moment().format('YYYY-MM-DD HH:mm:ss'))
    console.log('availNo', availNo, 'avail', avail, 'type', type)
    const { result } = await validateAndCancelOrder(instrument_id);
    if(avail) {
        const payload = {
            size: avail,
            type,
            order_type: 0, //1：只做Maker 4：市价委托
            instrument_id: instrument_id,
            price: mark_price,
            match_price: 0
        }
        return await authClient.futures().postOrder(payload);
    }
    return new Promise(resolve=>{ resolve({ result: avail && !result }) })
}

// 平仓，closeRatio平仓比例
const autoCloseOrderSingle = async ({ long_qty, short_qty, instrument_id, last }, params) => {
    const { closeRatio = 1 } = params;
    const { result } = await validateAndCancelOrder(instrument_id);
    const qty = Number(long_qty) || Number(short_qty)
    let size = Math.floor(qty * closeRatio)
    if(qty == 1) size = 1;
    if(size){
        const payload = {
            size,
            type: Number(long_qty) ? 3 : 4,
            order_type: 0,
            instrument_id: instrument_id,
            price: last,
            match_price: 0
        }
        return await authClient.futures().postOrder(payload);
    }
    return new Promise(resolve=>{ resolve({ result: !result }) })
}

// 获取可开张数
const getAvailNo = async ({val = 100, currency = 'BTC-USD', instrument_id = BTC_INSTRUMENT_ID, mark_price}) => {
    const result = await authClient.futures().getAccounts(currency);
    const { equity, contracts, total_avail_balance } = result;
    const { margin_frozen, margin_for_unfilled } = contracts[0];
    const available_qty = Number(equity) - Number(margin_frozen) - Number(margin_for_unfilled);
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

const getOrderModeSingle = async (orderMode = 3, holding) => {
    const ratio = (Number(holding.long_margin) && (Number(holding.long_unrealised_pnl) / Number(holding.long_margin))) +
        (Number(holding.short_margin) && (Number(holding.short_unrealised_pnl) / Number(holding.short_margin)));
    const leverage = Math.min(Number(holding.long_leverage), Number(holding.short_leverage));
    let condition = leverage / 100;
    console.log(holding.instrument_id,ratio,condition)
    await autoOperateByHoldingTime(holding,ratio,condition)
}

// 下单模式
function getOrderMode(orderMode = 2, btcHolding, eosHolding) {
    // const btcRatio = (Number(btcHolding.long_avail_qty) && Number(btcHolding.long_pnl_ratio)) +
    //     (Number(btcHolding.short_avail_qty) && Number(btcHolding.short_pnl_ratio));
    // const eosRatio = (Number(eosHolding.long_avail_qty) && Number(eosHolding.long_pnl_ratio)) +
    //     (Number(eosHolding.short_avail_qty) && Number(eosHolding.short_pnl_ratio));
    const btcRatio = (Number(btcHolding.long_margin) && (Number(btcHolding.long_unrealised_pnl) / Number(btcHolding.long_margin))) +
        (Number(btcHolding.short_margin) && (Number(btcHolding.short_unrealised_pnl) / Number(btcHolding.short_margin)));
    const eosRatio = (Number(eosHolding.long_margin) && (Number(eosHolding.long_unrealised_pnl) / Number(eosHolding.long_margin))) +
        (Number(eosHolding.short_margin) && (Number(eosHolding.short_unrealised_pnl) / Number(eosHolding.short_margin)));

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
    // 补仓，减少交易次数
    if(orderMode == 2){
        if(Number(btcHolding.long_margin) || Number(btcHolding.short_margin)) autoOperateByHolding(btcHolding,btcRatio,condition)
        if(Number(eosHolding.long_margin) || Number(eosHolding.short_margin)) autoOperateByHolding(eosHolding,eosRatio,condition)
    }
    // 补仓，频繁交易
    if(orderMode == 3){
        if(Number(btcHolding.long_margin) || Number(btcHolding.short_margin)) autoOperateByHoldingTime(btcHolding,btcRatio,condition)
        if(Number(eosHolding.long_margin) || Number(eosHolding.short_margin)) autoOperateByHoldingTime(eosHolding,eosRatio,condition)
    }
    // 不补仓，亏单早抛
    // if(orderMode == 4){
    //     if(Number(btcHolding.long_margin) || Number(btcHolding.short_margin)) autoOperateByHoldingTime(btcHolding,btcRatio,condition)
    //     if(Number(eosHolding.long_margin) || Number(eosHolding.short_margin)) autoOperateByHoldingTime(eosHolding,eosRatio,condition)
    // }
}

// 杠杆越大，手续费占比越高。。
const autoOperateByHoldingTime = async (holding,ratio,condition) => {
    const { instrument_id, last, long_leverage, short_leverage } = holding;
    const leverage = Math.max(Number(long_leverage),Number(short_leverage));
    const continuousObj = continuousMap[instrument_id];
    const lastObj = lastOrderMap[instrument_id];
    const winOrderObj = winOrderMap[instrument_id];
    console.log(instrument_id, continuousObj.continuousWinNum, continuousObj.continuousLossNum, continuousObj.continuousBatchNum, continuousObj.continuousProfitNum)
    // 盈利，半仓，止盈
    if(ratio > condition * 1 * frequency && !continuousMap.continuousProfitNum) {
        if(winOrderObj.order_id){
            const { state } = await authClient.futures().getOrder(instrument_id,winOrderObj.order_id);
            if(state=='2'){
                continuousMap.continuousProfitNum = continuousMap.continuousProfitNum + 1;
                winOrderObj.order_id = 0;
                return;
            }
        }
        const { order_id } = await autoCloseOrderSingle(holding,{ closeRatio: 0.5 })
        winOrderObj.order_id = order_id;
        return;
    }
    // 盈利
    if(ratio > condition * 2 * frequency){
        const { result } = await autoCloseOrderSingle(holding)
        if(result){
            continuousObj.continuousBatchNum = 0;
            continuousObj.continuousLossNum = 0;
            continuousObj.continuousWinNum = continuousObj.continuousWinNum + 1;
            continuousMap.continuousProfitNum = 0;

            lastObj.last = Number(last);

            let isReverse = false;
            let timeout = timeoutNo * 10;
            // 第3次盈利后反向
            if(continuousObj.continuousWinNum>2) {
                isReverse = true;
                timeout = timeoutNo / 10;
            }
            setTimeout(async ()=>{
                // 多仓时，本次价格比上次低，则过十倍时间后再开仓
                const { mark_price } = await cAuthClient.futures.getMarkPrice(instrument_id);
                const type = getCurrentDirection(holding);
                console.log('last', mark_price, lastObj.last, type)
                const isNeedOpenOrder = !!((type == 1 && Number(mark_price) < lastObj.last) || (type == 2 && Number(mark_price) > lastObj.last));

                let timeMultiple = 10;
                // 头两次盈利马上开仓
                if(isNeedOpenOrder && continuousObj.continuousWinNum<3) timeMultiple = 0;
                setTimeout(async ()=>{
                    await autoOpenOrderSingle(holding, { availRatio: 0.5, isReverse });
                },timeout * timeMultiple * frequency)
            },timeout * continuousObj.continuousWinNum * frequency)
        }
        return;
    }
    // 补仓后，回本即平仓
    if(continuousObj.continuousBatchNum && (ratio > 0.1 * leverage / 10 * continuousObj.continuousBatchNum)) {
        const { result } = await autoCloseOrderSingle(holding)
        if(result){
            continuousMap[instrument_id] = {
                continuousLossNum: 0,
                continuousWinNum: 0,
                continuousBatchNum: 0,
            };
            setTimeout(async ()=>{
                await autoOpenOrderSingle(holding, { availRatio: 0.5 });
            },timeoutNo * 2 * frequency)
        }
        return;
    }
    // 亏损，平仓，市价全平
    if(ratio < - condition * frequency){
        // const { result } = await autoCloseOrderSingle(holding);
        const { result } = await autoCloseOrderByMarketPriceByHolding(holding);
        if(result) {
            continuousObj.continuousBatchNum = 0;
            continuousObj.continuousLossNum = continuousObj.continuousLossNum + 1;
            continuousObj.continuousWinNum = 0;
            setTimeout(async ()=>{
                await autoOpenOrderSingle(holding,{ availRatio: 0.5 });
            },timeoutNo * 10 * 2 * frequency)
        }
        return;
    }
    // 亏损不平仓，补仓，亏损0.5
    if(ratio < - condition * 1 / 2 * frequency){
        const batchObj = batchOrderMap[instrument_id]
        // 没有补过仓
        if(!continuousObj.continuousBatchNum) {
            if(batchObj.order_id) {
                const { state } = await authClient.futures().getOrder(instrument_id,batchObj.order_id);
                console.log('state',state,instrument_id, 'order_id', order_id)
                // state:2 完全成交，补仓成功
                if(state=='2') {
                    continuousObj.continuousBatchNum = continuousObj.continuousBatchNum + 1;
                    batchObj.order_id = -1;
                    return;
                }
            }
            // 补仓
            const { result, order_id } = await autoOpenOrderSingle(holding);
            batchObj.order_id = order_id;
            console.log('result', result, instrument_id, 'order_id', order_id)
            return;
        }
        // 补过仓，平仓并再开半仓
        const { result } = await autoCloseOrderSingle(holding);
        if(result) {
            continuousObj.continuousBatchNum = 0;
            continuousObj.continuousLossNum = continuousObj.continuousLossNum + 1;
            continuousObj.continuousWinNum = 0;

            let isReverse = false;
            let timeout = timeoutNo * 10;
            // 连续亏损3次，立即反向
            if(continuousObj.continuousLossNum>2) {
                isReverse = true;
                timeout = timeoutNo / 10;
            }
            setTimeout(async ()=>{
                await autoOpenOrderSingle(holding,{ availRatio: 0.5, isReverse });
            },timeout * frequency)
        }
        return;
    }
}

const autoOperateByHolding = async (holding,ratio,condition) => {
    console.log('continuousBatchNum', continuousBatchNum)
    // 补仓后，回本即平仓
    if( (ratio > condition * 0.8) || (continuousBatchNum && (ratio > 0.01 * continuousBatchNum) )){
        continuousBatchNum = 0;
        continuousLossNum = 0;
        const { result } = await autoCloseOrderSingle(holding)
        if( result ) {
            setTimeout(async ()=>{
                await autoOpenOrderSingle(holding);
            },timeoutNo)
        }
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
        const { result } = await autoCloseOrderSingle(holding);
        console.log('close_result', result)
        continuousLossNum = continuousLossNum + 1;
        if( result ){
            // 连续亏损2次，反向
            let isReverse = false;
            if(continuousLossNum>1) isReverse = true;
            setTimeout(async ()=>{
                await autoOpenOrderSingle(holding,{ availRatio: 0.5, isReverse });
            },timeoutNo)
            return;
        }
    }
}

function startInterval() {
    if(myInterval) return myInterval;
    return setInterval(async ()=>{
        const { holding: btcHolding } = await authClient.futures().getPosition(BTC_INSTRUMENT_ID);
        const { holding: eosHolding } = await authClient.futures().getPosition(EOS_INSTRUMENT_ID);

        const btcQty = Number(btcHolding[0].long_qty) + Number(btcHolding[0].short_qty);
        const eosQty = Number(eosHolding[0].long_qty) + Number(eosHolding[0].short_qty);

        const qty = btcQty + eosQty;
        if(!qty) {
            return;
        }
        // getOrderMode(mode, btcHolding[0], eosHolding[0]);
        if(btcQty) getOrderModeSingle(mode, btcHolding[0]);
        if(eosQty) getOrderModeSingle(mode, eosHolding[0]);
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
