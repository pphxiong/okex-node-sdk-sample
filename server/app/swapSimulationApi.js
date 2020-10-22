import request from '../utils/request';
import moment from 'moment'

// const {PublicClient} = require('@okfe/okex-node');
const customAuthClient = require('./customSimulationAuthClient');

const monthMap = ['01','02','03','04','05','06','07','08','09','10','11','12'];

let BTC_INSTRUMENT_ID = "MNBTC-USD-SWAP";
let EOS_INSTRUMENT_ID = "MNEOS-USD-SWAP";
let myInterval;
let mode = 4; //下单模式
let initPosition = 0; //初始持仓数量

let frequency = 1;
// const winRatio = 2;
// const lossRatio = 0.6;

let continuousLossNum = 0; //连续亏损次数
let continuousWinNum = 0; //连续盈利次数
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

var config = require('./simulationConfig');
// const pClient = new PublicClient(config.urlHost);
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
    cAuthClient
        .account()
        .getCurrencies()
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/account/getWallet', function(req, response) {
    const {query = {}} = req;
    const {currency} = query.params || query;
    cAuthClient
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

app.get('/swap/getOrders', function(req, response) {
    const {query = {}} = req;
    const {instrument_id, limit, state = 2} = query; // "BTC-USD-200821"
    cAuthClient
        .swap
        .getOrders(instrument_id, {state, limit})
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/getAccounts', function(req, response) {
    const {query = {}} = req;
    const {instrument_id} = query;
    cAuthClient
        .swap
        .getAccount(instrument_id)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/getMarkPrice', function(req, response) {
    const {query = {}} = req;
    const {instrument_id} = query;
    cAuthClient
        .swap
        .getMarkPrice(instrument_id)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/information/', function(req, response) {
    const {query = {}} = req;
    const {currency} = query.params || query;
    request
        .get(`${config.urlHost}/api/information/v3/${currency}/long_short_ratio`)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/information/sentiment', function(req, response) {
    const {query = {}} = req;
    const {currency} = query.params || query;
    request
        .get(`${config.urlHost}/api/information/v3/${currency}/sentiment`)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/postLeverage', function(req, response) {
    const {query = {}} = req;
    const { leverage, side, instrument_id } = query;
    cAuthClient
        .swap
        .postLeverage(instrument_id, { leverage, side })
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/getLeverage', function(req, response) {
    const {query = {}} = req;
    const { instrument_id } = query;
    cAuthClient
        .swap
        .getSettings(instrument_id)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/postOrder', function(req, response) {
    const {query = {}} = req;
    cAuthClient
        .swap
        .postOrder(query)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
    // myInterval = startInterval();
});

const initContinuousObj = {
    continuousLossNum: 0,
    continuousWinNum: 0,
}

let continuousObj = initContinuousObj;

let isCurrentSideShort = false;
let lastPrice = 0;
let lastWinDirection = null;

const testOrder = async (historyList,endPrice, params) => {
    if(!historyList.length) {
        return { time: 0, totalPnl: 0, totalRatio: 0, totalFee: 0, endPrice }
    }

    const { leverage, winRatio, lossRatio } = params;
    const frequency = Number(params.frequency);

    let totalPnl = 0;

    const position = 10;
    const margin = position * 100 / historyList[0][1] / Number(leverage);
    let condition = Number(leverage) / 100;

    let primaryPrice = endPrice || historyList[0][1];
    let passNum = 0;
    let totalFee = 0;

    historyList.map(item=>{
        const size = Number(position) * 100 / Number(item[1]);
        let unrealized_pnl = size * (Number(item[1]) - Number(primaryPrice)) / Number(item[1])
        if(isCurrentSideShort) unrealized_pnl = -unrealized_pnl;

        const ratio = Number(unrealized_pnl) / Number(margin);

        // if(ratio < -condition * lossRatio * frequency) console.info(item[0],'ratio',ratio, 'isCurrentSideShort', isCurrentSideShort)

        let newWinRatio = Number(winRatio);
        let newLossRatio = Number(lossRatio);

        // if(continuousObj.continuousWinNum==1) {
        //     newLossRatio = newLossRatio / 2;
        //     newWinRatio = newWinRatio / 2;
        // }

        console.log(item[0])
        console.log('primaryPrice',primaryPrice, 'price', item[1])
        console.log('ratio', ratio, 'condition', condition, 'isCurrentSideShort', isCurrentSideShort)
        console.log(ratio > condition * newWinRatio * frequency, ratio < - condition * newLossRatio * frequency)

        // 盈利
        if(ratio > condition * newWinRatio * frequency){
            lastWinDirection = 'long';
            if(isCurrentSideShort){
                lastWinDirection = 'short'
            }

            const fee = Number(margin) * 5 * 2 / 10000;
            totalFee += fee;
            totalPnl += unrealized_pnl - fee;
            continuousObj.continuousLossNum = 0;
            continuousObj.continuousWinNum = continuousObj.continuousWinNum + 1;

            // isCurrentSideShort = !isCurrentSideShort;
            if(!(isCurrentSideShort && lastWinDirection == 'short') || (!isCurrentSideShort && lastWinDirection == 'long')){
                isCurrentSideShort = !isCurrentSideShort;
            }

            primaryPrice = item[1];
            // console.log('win::totalPnl',totalPnl, ratio,unrealized_pnl)
        }
        // 亏损，平仓，市价全平
        if(ratio < - condition * newLossRatio * frequency){
            const fee = Number(margin) * 5 * 2 / 10000;
            totalFee += fee;
            totalPnl += unrealized_pnl - fee;

            continuousObj.continuousLossNum = continuousObj.continuousLossNum + 1;
            continuousObj.continuousWinNum = 0;

            isCurrentSideShort = !isCurrentSideShort;

            // if(continuousObj.continuousLossNum > 1) {
            //     if(lastWinDirection == 'short'){
            //         isCurrentSideShort = true;
            //     }else{
            //         isCurrentSideShort = false;
            //     }
            // }

            console.info(item[0],'continuousLossNum', continuousObj.continuousLossNum)
            console.info('ratio', ratio)

            primaryPrice = item[1];
        }
        // console.log(item[0],'ratio',ratio,item[1],primaryPrice,unrealized_pnl, margin, isCurrentSideShort, condition)
        // console.log('continuousWinNum',continuousObj.continuousWinNum, 'continuousLossNum', continuousObj.continuousLossNum)
    })

    console.log('totalPnl',totalPnl)

    const totalRatio = totalPnl * 100 / Number(margin);
    return { time: historyList[0][0], totalPnl, totalRatio, totalFee, endPrice: primaryPrice }
}

const getMonthMultiPnl = async params => {
    const { duration } = params;

    let t = 0;
    let tRatio = 0;
    let mList = [];
    let i = 0;
    while(i<duration && !multiStatus) {
        const {
            leverage,
            winRatio,
            lossRatio,
            frequency
        } = params;
        const firstDay = `2020-${monthMap[i]}-01 00:00:00`;
        const payload = {
            date: firstDay,
            leverage,
            winRatio,
            lossRatio,
            frequency
        }
        const  { pnl, ratio } = await getMonthPnl(payload);

        console.log('pnl,ratio',monthMap[i],pnl,ratio)
        t += pnl;
        tRatio += ratio;
        mList.push({
            month: monthMap[i],
            totalPnl: pnl,
            totalRatio: ratio
        })
        i++;

        multiResult = { mList, pnl: t, ratio: tRatio };
    }

    return { mList, pnl: t, ratio: tRatio }
}

const getMonthPnl = async params => {
    const { date } = params;
    let loopNum = 0;
    let list = [];
    let t = 0;
    let tRatio = 0;

    while(loopNum < 134) {
        const start = moment(date,'YYYY-MM-DD HH:mm:ss').add((loopNum + 1) * 5,'hours').toISOString();
        const end = moment(date,'YYYY-MM-DD HH:mm:ss').add(loopNum * 5,'hours').toISOString();

        const payload = {
            granularity: 60,
            // limit: 20,
            start,
            end
        }

        const data  =  await cAuthClient.swap.getHistory('BTC-USD-SWAP', payload)

        if(Array.isArray(data)){
            const result = await testOrder(data.reverse(),lastPrice, params);
            t += result.totalPnl;
            tRatio += result.totalRatio;
            list.push(result);
            loopNum++;
            lastPrice = result.endPrice;
        }

        await new Promise(resolve => { setTimeout( ()=>{ resolve() }, 2000 / 6 ) })
    }
    return { pnl: t, ratio: tRatio };
}

app.get('/swap/testOrder', async (req, response) => {
    const {query = {}} = req;
    // const { month } = query;
    // const firstDay = `2020-${month}-01 00:00:00`;
    const res = await getMonthPnl(query);
    send(response, {errcode: 0, errmsg: 'ok', data: res});
});

let multiStatus = 0;
let multiResult = {}
app.get('/swap/testOrderMulti', async (req, response) => {
    const {query = {}} = req;
    send(response, {errcode: 0, errmsg: 'ok', });

    multiStatus = 0;
    multiResult = {}
    const res = await getMonthMultiPnl(query);
    multiStatus = 1;
    multiResult = res;
});

app.get('/swap/getMultiStatus', async (req, response) => {
    send(response, {errcode: 0, errmsg: 'ok', data: { status: multiStatus, result: multiResult } });
});

app.get('/swap/getPosition', function(req, response) {
    const {query = {}} = req;
    const { instrument_id } = query;
    cAuthClient
        .swap
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

app.get('/swap/autoCloseOrderByInstrumentId', function(req, response) {
    const {query = {}} = req;
    const { instrument_id, direction } = query;
    autoCloseOrderByInstrumentId({instrument_id, direction}).then(res=>{
        send(response, {errcode: 0, errmsg: 'ok', data: res });
    })
});

// 市价全平By instrument_id
const autoCloseOrderByInstrumentId =  async ({instrument_id, direction}) => {
    if(!direction){
        const { holding } = await cAuthClient.swap.getPosition(instrument_id);
        direction = holding[0].side;
    }
    const result = await cAuthClient
        .swap
        .closePosition({instrument_id, direction})
    return result;
}

// 市价全平By holding
const autoCloseOrderByMarketPriceByHolding =  async ({ instrument_id, side  }) => {
    await validateAndCancelOrder(instrument_id);
    return await cAuthClient.swap.closePosition({instrument_id, direction: side })
}

// 检测是否有未成交的挂单， state：2 完全成交， 6： 未完成， 7： 已完成
// 如果有就撤销
const validateAndCancelOrder = async (instrument_id) => {
    const { order_info } = await cAuthClient.swap.getOrders(instrument_id, {state: 6, limit: 1})
    console.log('cancelorder', instrument_id, order_info.length)
    if( order_info && order_info.length ){
        const { order_id } = order_info[0];
        return await cAuthClient.swap.postCancelOrder(instrument_id,order_id)
    }
    return new Promise(resolve=>{ resolve({ result: false }) })
}

// 下单，并返回订单信息
const getOrderState = async (payload) => {
    const { instrument_id } = payload;
    const { order_id } = await cAuthClient.swap.postOrder(payload);
    return await cAuthClient.swap.getOrder(instrument_id,order_id)
}

// 开仓，availRatio开仓比例
const autoOpenOrderSingle = async (holding, params = {}) => {
    const { isReverse = false, availRatio = 1, order_type = 0, isOpenShort = false } = params;
    const { instrument_id, position } = holding;
    const { mark_price } = await cAuthClient.swap.getMarkPrice(instrument_id);
    // 可开张数
    let availNo;
    let avail = 0;

    if(instrument_id.includes('BTC')){
        availNo = await getAvailNo({ mark_price });
    }
    // avail = Math.min(Math.floor(Number(availNo) * availRatio), Number(position));
    avail = Math.min(Math.floor(Number(availNo)), Number(position));

    let type = isReverse ? reverseDirection(getCurrentDirection(holding)) : getCurrentDirection(holding);
    if(isOpenShort) type = 2;

    console.log('openOrderMoment', moment().format('YYYY-MM-DD HH:mm:ss'))
    console.log('availNo', availNo, 'avail', avail, 'type', type)
    const { result } = await validateAndCancelOrder(instrument_id);
    if(avail) {
        const payload = {
            size: avail,
            type,
            order_type, //1：只做Maker 4：市价委托
            instrument_id: instrument_id,
            price: mark_price,
            match_price: 0
        }
        return await cAuthClient.swap.postOrder(payload);
    }
    return new Promise(resolve=>{ resolve({ result: avail && !result }) })
}

// 平仓，closeRatio平仓比例
const autoCloseOrderSingle = async ({ avail_position, position, instrument_id, last, side }, params = {}) => {
    const { closeRatio = 1, order_type = 0 } = params;
    const { result } = await validateAndCancelOrder(instrument_id);
    const qty = Number(avail_position)
    let size = Math.floor(qty * closeRatio)
    if(qty == 1) size = 1;
    if(size){
        const payload = {
            size,
            type: side == 'long' ? 3 : 4,
            order_type,
            instrument_id: instrument_id,
            price: last,
            match_price: 0
        }
        console.log('payload',payload)
        return await cAuthClient.swap.postOrder(payload);
    }
    return new Promise(resolve=>{ resolve({ result: !result }) })
}

// 获取可开张数
const getAvailNo = async ({val = 100, currency = 'BTC-USD', instrument_id = BTC_INSTRUMENT_ID, mark_price}) => {
    const result = await cAuthClient.swap.getAccount(instrument_id);
    const { equity, margin_frozen, margin, total_avail_balance } = result.info;
    const available_qty = Number(equity) - Number(margin_frozen) - Number(margin);
    console.log('equity', equity, 'margin_frozen', margin_frozen, 'margin', margin)
    console.log('available_qty', available_qty)
    console.log('total_avail_balance', total_avail_balance)
    if(!mark_price) {
        const result = await cAuthClient.swap.getMarkPrice(instrument_id);
        mark_price = result.mark_price;
    }
    const leverageResult = await cAuthClient.swap.getSettings(instrument_id);
    const { long_leverage } = leverageResult;

    return Math.floor(Number(total_avail_balance) * Number(mark_price) * Number(long_leverage) * 0.98 / val) || 0;
}

// 合约费率
app.get('/swap/getTradeFee', function(req, response) {
    const {query = {}} = req;
    cAuthClient.swap.getTradeFee(query).then(res=>{
        send(response, {errcode: 0, errmsg: 'ok', data: res });
    })
});

// 历史数据
app.get('/swap/getHistory', function(req, response) {
    const {query = {}} = req;
    const { instrument_id } = query;
    delete query.instrument_id;
    cAuthClient.swap.getHistory(instrument_id, query).then(res=>{
        send(response, {errcode: 0, errmsg: 'ok', data: res });
    })
});

// 当前持仓方向
function getCurrentDirection(holding) {
    let direction = 1; // 多
    if(holding.side=='short') direction = 2; // 空
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

const getOrderModeSingle = async (orderMode = mode, holding) => {
    if(orderMode == 4){
        return await autoOperateSwap(holding)
    }
    // await autoOperateByHoldingTime(holding,ratio,condition)
}

const autoOperateSwap = async (holding) => {
    const { instrument_id, last, leverage, position, avg_cost, margin, side } = holding;

    const size = Number(position) * 100 / Number(last);
    let unrealized_pnl = size * (Number(last) - Number(avg_cost)) / Number(last);
    if(side=='short') unrealized_pnl = - unrealized_pnl;

    const ratio = Number(unrealized_pnl) / Number(margin);

    const condition = Number(leverage) / 100;

    const continuousObj = continuousMap[instrument_id];
    const lastObj = lastOrderMap[instrument_id];
    // const winOrderObj = winOrderMap[instrument_id];
    // const batchObj = batchOrderMap[instrument_id];
    console.log(instrument_id, ratio)
    console.info('frequency', frequency, 'winRatio', winRatio, 'lossRatio', lossRatio, 'leverage', leverage, 'side', side)

    if(continuousObj.continuousLossNum>2){
        console.log('continuousLossNum',continuousObj.continuousLossNum)
    }

    // 盈利
    if(ratio > condition * winRatio * frequency){
        // const { result } = await autoCloseOrderSingle(holding)
        const { result } = await autoCloseOrderByMarketPriceByHolding(holding);
        if(result) {
            continuousObj.continuousLossNum = 0;
            continuousObj.continuousWinNum = continuousObj.continuousWinNum + 1;

            await autoOpenOrderSingle(holding);
        }
        return;
    }
    // 亏损，平仓，市价全平
    if(ratio < - condition * lossRatio * frequency){
        const { result } = await autoCloseOrderByMarketPriceByHolding(holding);
        if(result) {
            continuousObj.continuousLossNum = continuousObj.continuousLossNum + 1;
            continuousObj.continuousWinNum = 0;

            if(continuousObj.continuousLossNum>3) return;

            let isOpenShort = false;
            if(continuousObj.continuousLossNum>1) isOpenShort = true;
            await autoOpenOrderSingle(holding, isOpenShort);
        }
        return;
    }
}

function startInterval() {
    if(myInterval) return myInterval;
    return setInterval(async ()=>{
        console.log('moment', moment().format('YYYY-MM-DD HH:mm:ss'))

        const { holding: btcHolding } = await cAuthClient.swap.getPosition(BTC_INSTRUMENT_ID);
        // const { holding: eosHolding } = await cAuthClient.swap.getPosition(EOS_INSTRUMENT_ID);

        const btcQty = Number(btcHolding[0].position);
        // const eosQty = Number(eosHolding[0].position);

        const qty = btcQty;
        if(!qty) {
            return;
        }
        if(btcQty) getOrderModeSingle(mode,  btcHolding[0]);
        // if(eosQty) getOrderModeSingle(mode,  eosHolding[0]);
    },1000 * 2.5)
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
// myInterval = startInterval()
app.listen(8092);

console.log('8092 server start');
