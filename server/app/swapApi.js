import request from '../utils/request';
import moment from 'moment'

// const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');
const customAuthClient = require('./customAuthClient');

let BTC_INSTRUMENT_ID = "BTC-USD-SWAP";
let EOS_INSTRUMENT_ID = "EOS-USD-SWAP";
let myInterval;
let mode = 4; //下单模式

let frequency = 1;
const winRatio = 2;
const lossRatio = 0.6;
let initPosition = 20;

const continuousMap = {
    [BTC_INSTRUMENT_ID]: {
        continuousLossNum: 0,
        continuousWinNum: 0,
        continuousBatchNum: 0,
        continuousProfitNum: 0,
        continuousTripleLossNum: 0,
    },
    [EOS_INSTRUMENT_ID]: {
        continuousLossNum: 0,
        continuousWinNum: 0,
        continuousBatchNum: 0,
        continuousProfitNum: 0,
        continuousTripleLossNum: 0,
    },
};

var config = require('./config');
// const pClient = new PublicClient(config.urlHost);
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

app.get('/swap/getOrders', function(req, response) {
    const {query = {}} = req;
    const {instrument_id, limit, state = 2} = query; // "BTC-USD-200821"
    authClient
        .swap()
        .getOrders(instrument_id, {state, limit})
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/getAccounts', function(req, response) {
    const {query = {}} = req;
    const {instrument_id} = query;
    authClient
        .swap()
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
    authClient
        .swap()
        .postLeverage(instrument_id, { leverage, side })
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});

app.get('/swap/getLeverage', function(req, response) {
    const {query = {}} = req;
    const { instrument_id } = query;
    authClient
        .swap()
        .getSettings(instrument_id)
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
    myInterval = startInterval();
});

app.get('/swap/getPosition', function(req, response) {
    const {query = {}} = req;
    const { instrument_id } = query;
    authClient
        .swap()
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
        const { holding } = await authClient.swap().getPosition(instrument_id);
        direction = holding[0].side;
    }
    const result = await cAuthClient
        .swap
        .closePosition({instrument_id, direction})
    return result;
}

// 市价全平By holding
const autoCloseOrderByMarketPriceByHolding =  async ({ instrument_id, side  }, type = 0) => {
    // await validateAndCancelOrder({instrument_id, type});
    return await cAuthClient.swap.closePosition({instrument_id, direction: side })
}

// 检测是否有未成交的挂单， state：2 完全成交， 6： 未完成， 7： 已完成
// 如果有就撤销, type: 1 撤销other单
const validateAndCancelOrder = async ({instrument_id, order_id: origin_order_id, type = 0}) => {
    const { order_info } = await authClient.swap().getOrders(instrument_id, {state: 6, limit: 3})
    console.log('cancelorder', instrument_id, order_info.length, origin_order_id)
    if( order_info && order_info.length ){
        let curOrder = order_info.find(item=>item.order_id == origin_order_id)
        curOrder = curOrder || {}
        const { order_id, size, filled_qty } = curOrder;
        if(origin_order_id == order_id && Number(size) > Number(filled_qty) * 2) return await authClient.swap().postCancelOrder(instrument_id,order_id)
    }
    return new Promise(resolve=>{ resolve({ result: false }) })
}

// 下单，并返回订单信息
const getOrderState = async (payload) => {
    const { instrument_id } = payload;
    const { order_id } = await authClient.swap().postOrder(payload);
    return await authClient.swap().getOrder(instrument_id,order_id)
}

const autoOpenOtherOrderSingle = async (params = {}) => {
    const { openSide = 'long', } = params;
    otherPositionSide = openSide

    const position = initPosition * 1

    const type = openSide == 'long' ? 1 : 2;
    console.log('openOtherOrderMoment', openSide, moment().format('YYYY-MM-DD HH:mm:ss'))
    console.log('position', position, 'type', type, 'side', openSide)

    const instrument_id = BTC_INSTRUMENT_ID;
    const payload = {
        size: position,
        type,
        order_type: 4, //1：只做Maker 4：市价委托
        instrument_id,
        // price: mark_price,
        // match_price: 0
    }

    await authClient.swap().postOrder(payload)

    const { mark_price } = await cAuthClient.swap.getMarkPrice(instrument_id);
    otherPositionPrimaryPrice = Number(mark_price)

    // let hasOrderInterval = setInterval(async ()=>{
    //     const { result } = await validateAndCancelOrder({instrument_id, order_id});
    //     if(result == false) {
    //         clearInterval(hasOrderInterval)
    //         hasOrderInterval = null;
    //         return;
    //     }
    //     const { mark_price } = await cAuthClient.swap.getMarkPrice(instrument_id);
    //     const payload = {
    //         size: position,
    //         type,
    //         // order_type: 0, //1：只做Maker 4：市价委托
    //         instrument_id,
    //         price: mark_price,
    //         match_price: 0
    //     }
    //     order_id = (await authClient.swap().postOrder(payload)).order_id;
    // },1500)

}

// 开仓，availRatio开仓比例
const autoOpenOrderSingle = async (params = {}) => {
    const { openSide = 'long', lossNum = 0, winNum = 0, continuousWinSameSideNum = 0, continuousLossSameSideNum = 0, } = params;
    let changeRatio = 1;
    // if(lossNum == 2 || lossNum == 4) {
    //     changeRatio = 1;
    // }else if(lossNum > 2) {
    //     const temp = lossNum - 3
    //     changeRatio = temp * (1 - temp / 5 ) + 1
    // }else if(lossNum) {
    //     changeRatio = 1.5;
    // }
    // if(
    //     (!continuousWinSameSideNum
    //         &&
    //         lossNum == 2)
    //     ||
    //     (continuousLossSameSideNum == 2
    //         &&
    //         lossNum == 2)
    // ){
    //     changeRatio = 0.05;
    // }
    //
    // if(winNum) changeRatio = 2
    changeRatio = changeRatio > 0 ? changeRatio : 1
    let positionRatio = changeRatio

    const position = Math.ceil(initPosition * positionRatio)

    // const { instrument_id, position: holdingPosition } = holding;
    // // 可开张数
    // let availNo;
    // let avail = 0;
    //
    // if(instrument_id.includes('BTC')){
    //     availNo = await getAvailNo({ mark_price });
    // }else{
    //     availNo = await getAvailNo({ val: 10, currency: 'EOS-USD', instrument_id: EOS_INSTRUMENT_ID, mark_price });
    // }
    // avail = Math.min(Math.floor(Number(availNo)), Number(position));

    const type = openSide == 'long' ? 1 : 2;
    const instrument_id = BTC_INSTRUMENT_ID;
    console.log('openOrderMoment', moment().format('YYYY-MM-DD HH:mm:ss'))
    console.log('position', position, 'type', type, 'side', openSide)

    // const { result } = await validateAndCancelOrder({instrument_id, type: 1});
    if(position) {
        const payload = {
            size: position,
            type,
            order_type: 4, //1：只做Maker 4：市价委托
            instrument_id,
            // price: mark_price,
            // match_price: 0
        }

        await authClient.swap().postOrder(payload)

        const { mark_price } = await cAuthClient.swap.getMarkPrice(instrument_id);
        primaryPrice = Number(mark_price)

        // let order_id = (await authClient.swap().postOrder(payload)).order_id;

        // let hasOrderInterval = setInterval(async ()=>{
        //     const { result } = await validateAndCancelOrder({instrument_id, order_id});
        //     if(result == false) {
        //         clearInterval(hasOrderInterval)
        //         hasOrderInterval = null;
        //         return;
        //     }
        //     const { mark_price } = await cAuthClient.swap.getMarkPrice(instrument_id);
        //     const payload = {
        //         size: position,
        //         type,
        //         order_type: 4, //1：只做Maker 4：市价委托
        //         instrument_id: instrument_id,
        //         // price: mark_price,
        //         // match_price: 0
        //     }
        //     order_id = (await authClient.swap().postOrder(payload)).order_id;
        // },1500)

        return true;
    }
    // return new Promise(resolve=>{ resolve({ result: true }) })
}

// 平仓，closeRatio平仓比例
// const autoCloseOrderSingle = async ({ avail_position, position, instrument_id, last, side }, params = {}) => {
//     const { closeRatio = 1 } = params;
//     const { result } = await validateAndCancelOrder({instrument_id});
//     const qty = Number(avail_position)
//     let size = Math.floor(qty * closeRatio)
//     if(qty == 1) size = 1;
//     if(size){
//         const payload = {
//             size,
//             type: side == 'long' ? 3 : 4,
//             // order_type: 0,
//             instrument_id: instrument_id,
//             price: last,
//             match_price: 0
//         }
//         return await authClient.swap().postOrder(payload);
//     }
//     return new Promise(resolve=>{ resolve({ result: !result }) })
// }

// 获取可开张数
const getAvailNo = async ({val = 100, currency = 'BTC-USD', instrument_id = BTC_INSTRUMENT_ID, mark_price}) => {
    const result = await authClient.swap().getAccount(instrument_id);
    const { equity, margin_frozen, margin, total_avail_balance } = result.info;
    const available_qty = Number(equity) - Number(margin_frozen) - Number(margin);
    console.log('equity', equity, 'margin_frozen', margin_frozen, 'margin', margin)
    console.log('available_qty', available_qty)
    console.log('total_avail_balance', total_avail_balance)
    if(!mark_price) {
        const result = await cAuthClient.swap.getMarkPrice(instrument_id);
        mark_price = result.mark_price;
    }
    const leverageResult = await authClient.swap().getSettings(instrument_id);
    const { long_leverage } = leverageResult;

    return Math.floor(Number(total_avail_balance) * Number(mark_price) * Number(long_leverage) * 0.98 / val) || 0;
}

// 合约费率
app.get('/swap/getTradeFee', function(req, response) {
    cAuthClient.swap.getTradeFee().then(res=>{
        send(response, {errcode: 0, errmsg: 'ok', data: res });
    })
});

// 设置亏损和盈利数据
app.get('/swap/setContinousWinAndLoss', function(req, response) {
    const {query = {}} = req;
    const {
        instrument_id,
        continuousWinNum,
        continuousLossNum,
        lastWinDirection : lsd,
        lastLossDirection: lld,
        continuousLossSameSideNum: clss,
        continuousWinSameSideNum: cwss,
        lastLastLossDirection: llld,
        lastLastWinDirection: llwd,
        initPosition: ip,
        lastMostWinRatio: lmwr,
        isOpenOtherOrder: iooo,
        otherPositionSide: otps,
        otherPositionLoss: otpl,
    } = query;
    const continuousObj = continuousMap[instrument_id];
    continuousObj.continuousLossNum = Number(continuousLossNum);
    continuousObj.continuousWinNum = Number(continuousWinNum);
    lastWinDirection = lsd;
    lastLossDirection = lld;
    continuousLossSameSideNum = Number(clss)
    continuousWinSameSideNum = Number(cwss)
    lastLastLossDirection = llld
    lastLastWinDirection = llwd
    initPosition = Number(ip)
    lastMostWinRatio = Number(lmwr)
    isOpenOtherOrder = iooo == 'true' || iooo == true
    otherPositionSide = otps
    otherPositionLoss = otpl == 'true' || otpl == true

    send(response, {errcode: 0, errmsg: 'ok', data: {
            instrument_id,
            continuousObj,
            lastWinDirection: lsd,
            lastLossDirection: lld,
            continuousLossSameSideNum: Number(clss),
            continuousWinSameSideNum: Number(cwss),
            lastLastLossDirection: llld,
            lastLastWinDirection: llwd,
            initPosition: Number(ip),
            lastMostWinRatio: Number(lmwr),
            isOpenOtherOrder: iooo,
            otherPositionSide: otps,
            otherPositionLoss: otpl
        } });
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
    // const ratio = Number(holding.unrealized_pnl) / Number(holding.margin);
    // const leverage = Number(holding.leverage);
    // let condition = leverage / 100;
    // console.log(holding.instrument_id,ratio,condition)
    if(orderMode == 4){
        return await autoOperateSwap(holding)
    }
    // await autoOperateByHoldingTime(holding,ratio,condition)
}

let lastWinDirection = null;
let lastLossDirection = null;
let continuousLossSameSideNum = 0;
let continuousWinSameSideNum = 0;
let lastLastWinDirection = null;
let lastLastLossDirection = null;
let ratioChangeNum = 0;
let lastMostWinRatio = 0;
let isOpenOtherOrder = false;
let primaryPrice = 0;
let otherPositionPrimaryPrice = 0;
const afterWin = async (holding, type = 0) => {
    const { instrument_id, side } = holding;
    const continuousObj = continuousMap[instrument_id];

    let isOpenShort = side == 'short';
    isOpenShort = !isOpenShort;

    if((side == 'short' && lastWinDirection == 'short')
        || (side == 'long' && lastWinDirection == 'long')
    ){
        continuousWinSameSideNum++;
        isOpenShort = !isOpenShort;
    }else{
        continuousWinSameSideNum = 0;
    }

    continuousObj.continuousLossNum = 0;
    continuousObj.continuousWinNum = continuousObj.continuousWinNum + 1;

    continuousLossSameSideNum = 0;
    lastLastWinDirection = lastWinDirection;
    lastWinDirection = side;

    ratioChangeNum = 0
    lastMostWinRatio = 0;

    const openSide = isOpenShort ? 'short' : 'long';
    const payload = {
        openSide,
        lossNum: continuousObj.continuousLossNum,
        winNum: continuousObj.continuousWinNum,
        continuousWinSameSideNum,
        continuousLossSameSideNum
    }
    await autoOpenOrderSingle(payload);

    if(
        // continuousObj.continuousWinNum == 1
        // &&
        !isOpenOtherOrder
        &&
        !type
        // ||
        // (continuousWinSameSideNum
        //     && side == 'long'
        // )
    ){
        isOpenOtherOrder = true;
        let otherOpenSide = openSide;
        if(continuousObj.continuousWinNum > 3) otherOpenSide = openSide == 'short' ? 'long' : 'short'
        await autoOpenOtherOrderSingle({ openSide: otherOpenSide })

    }
}
const afterLoss = async (holding,type) =>{
    const { instrument_id, side } = holding;
    const continuousObj = continuousMap[instrument_id];

    let isOpenShort = side == 'short';
    isOpenShort = !isOpenShort;

    if(
        side == 'short'
        &&
        lastWinDirection == 'long'
    ){
        continuousLossSameSideNum++;
        if(
            continuousLossSameSideNum < 2
        ){
            isOpenShort = !isOpenShort;
        }
    }else if(
        side == 'long'
        &&
        lastWinDirection == 'short'
        &&
        continuousWinSameSideNum < 1
    ) {
        continuousLossSameSideNum++;
        if(continuousLossSameSideNum < 2){
            isOpenShort = !isOpenShort;
        }
    }

    // if(isOpenOtherOrder && !continuousWinSameSideNum) {
    //     isOpenShort = otherPositionSide == 'long'
    // }

    continuousObj.continuousLossNum = continuousObj.continuousLossNum + 1;
    continuousObj.continuousWinNum = 0;

    lastLastLossDirection = lastLossDirection;
    lastLossDirection = side;

    lastMostWinRatio = 0;

    const openSide = isOpenShort ? 'short' : 'long';
    const payload = {
        openSide,
        lossNum: continuousObj.continuousLossNum,
        winNum: continuousObj.continuousWinNum,
        continuousWinSameSideNum,
        continuousLossSameSideNum
    }
    await autoOpenOrderSingle(payload);

    if(
        (!continuousWinSameSideNum
            ||
            continuousObj.continuousLossNum > 3
        )
        &&
        !isOpenOtherOrder
        &&
        !type
    ){
        isOpenOtherOrder = true;
        const otherOpenSide = openSide == 'short' ? 'long' : 'short';
        await autoOpenOtherOrderSingle({ openSide: otherOpenSide })
    }
}
// 平半仓
const closeHalfPosition = async (holding, mark_price) => {
    const { instrument_id, last, leverage, position, avg_cost, margin, side } = holding;
    // const { mark_price } = await cAuthClient.swap.getMarkPrice(instrument_id);

    const payload = {
        size: Math.ceil(Number(position) / 2),
        type: side == 'long' ? 3 : 4,
        instrument_id,
        order_type: 4,
        // price: mark_price,
        // match_price: 0
    }

    await authClient.swap().postOrder(payload)

    // let hasOrderInterval = setInterval(async ()=>{
    //     const { result } = await validateAndCancelOrder({instrument_id, order_id});
    //     if(result == false) {
    //         clearInterval(hasOrderInterval)
    //         hasOrderInterval = null;
    //         return;
    //     }
    //     const { mark_price } = await cAuthClient.swap.getMarkPrice(instrument_id);
    //     const payload = {
    //         size: Math.ceil(Number(position) / 2),
    //         type: side == 'long' ? 3 : 4,
    //         instrument_id,
    //         order_type: 4,
    //         // price: mark_price,
    //         // match_price: 0
    //     }
    //     order_id = (await authClient.swap().postOrder(payload)).order_id;
    // },1500)
}
let otherPositionLoss = false
let otherPositionSide = null
const autoOtherOrder = async (holding,mark_price,isHalf = false) => {
    const { instrument_id, last, leverage, position: originPosition, avg_cost, margin: originMargin, side } = holding;

    otherPositionPrimaryPrice = otherPositionPrimaryPrice || Number(avg_cost)

    const position = isHalf ? Number(originPosition) / 2 : Number(originPosition)
    const margin = isHalf ? Number(originMargin) / 2 : Number(originMargin)

    const size = Number(position) * 100 / Number(mark_price);
    let unrealized_pnl = size * (Number(mark_price) - otherPositionPrimaryPrice) / Number(mark_price);
    if(side=='short') unrealized_pnl = - unrealized_pnl;

    const ratio = Number(unrealized_pnl) / Number(margin);
    const condition = Number(leverage) / 100;

    const continuousObj = continuousMap[instrument_id];

    let newWinRatio = Number(winRatio) / 5.0
    let newLossRatio = Number(lossRatio) * 1.5

    // if(continuousObj.continuousWinNum > 1){
    //     newWinRatio = Number(winRatio) / 6
    //     newLossRatio = Number(lossRatio) / 1.5
    // }
    //
    // if(otherPositionLoss){
    //     newWinRatio = Number(winRatio) / 10
    //     newLossRatio = Number(lossRatio) / 1.2
    // }

    console.log('@@@@@@@@@other continuousLossNum start@@@@@@@@@')
    console.log(moment().format('YYYY-MM-DD HH:mm:ss'), instrument_id, ratio, position)
    console.info('frequency', frequency, 'newWinRatio', newWinRatio, 'newLossRatio', newLossRatio, 'leverage', leverage, 'side', side)
    console.log('otherPositionLoss',otherPositionLoss)
    console.log('isHalf',isHalf)
    // console.log('continuousWinNum',continuousObj.continuousWinNum, 'continuousLossNum',continuousObj.continuousLossNum)
    // console.log('lastWinDirection', lastWinDirection, 'lastLastWinDirection', lastLastWinDirection)
    // console.log('lastLossDirection', lastLossDirection, 'lastLastLossDirection', lastLastLossDirection)
    // console.log('continuousWinSameSideNum',continuousWinSameSideNum,'continuousLossSameSideNum',continuousLossSameSideNum)
    // console.log('lastMostWinRatio',lastMostWinRatio)
    console.log('@@@@@@@@@other continuousLossNum end@@@@@@@@@@@@@')

    if(ratio > condition * newWinRatio * frequency) {
        positionChange = true
        isOpenOtherOrder = false
        otherPositionLoss = false

        if(isHalf || (Number(holding.position) == Number(initPosition) * 2)){
            await closeHalfPosition(holding)
        }else{
            await autoCloseOrderByMarketPriceByHolding(holding);
        }

        if(continuousObj.continuousLossNum){
            const openSide = side == 'short' ? 'long' : 'short';
            const payload = {
                openSide,
                lossNum: continuousObj.continuousLossNum,
                winNum: continuousObj.continuousWinNum,
                continuousWinSameSideNum,
                continuousLossSameSideNum
            }
            await autoOpenOtherOrderSingle(payload);
            isOpenOtherOrder = true
            otherPositionLoss = true
        }
    }
    if(ratio < - condition * newLossRatio * frequency){
        positionChange = true
        isOpenOtherOrder = false
        otherPositionLoss = false

        if(isHalf || (Number(holding.position) == Number(initPosition) * 2)){
            await closeHalfPosition(holding)
        }else{
            await autoCloseOrderByMarketPriceByHolding(holding);
        }
        // await autoCloseOrderByMarketPriceByHolding(holding);

        if(continuousObj.continuousLossNum){
            const openSide = side == 'short' ? 'long' : 'short';
            const payload = {
                openSide,
                lossNum: continuousObj.continuousLossNum,
                winNum: continuousObj.continuousWinNum,
                continuousWinSameSideNum,
                continuousLossSameSideNum
            }
            await autoOpenOtherOrderSingle(payload);
            isOpenOtherOrder = true
            otherPositionLoss = true

        }
    }
}
const autoOperateSwap = async (holding,mark_price,isHalf=false) => {
    const { instrument_id, last, leverage, position: originPosition, avg_cost, margin: originMargin, side } = holding;

    primaryPrice = primaryPrice || Number(avg_cost)

    const position = isHalf ? Number(originPosition) / 2 : Number(originPosition)
    const margin = isHalf ? Number(originMargin) / 2 : Number(originMargin)

    const size = Number(position) * 100 / Number(mark_price);
    let unrealized_pnl = size * (Number(mark_price) - primaryPrice) / Number(mark_price);
    if(side=='short') unrealized_pnl = - unrealized_pnl;
    let isOpenShort = side == 'short';

    const ratio = Number(unrealized_pnl) / Number(margin);
    const condition = Number(leverage) / 100;

    const continuousObj = continuousMap[instrument_id];

    let newWinRatio = Number(winRatio);
    let newLossRatio = Number(lossRatio);

    if(
        // lastLastLossDirection != lastLossDirection
        // &&
        lastLossDirection != side
    ){
        if(continuousObj.continuousLossNum > 7){
            newWinRatio = continuousWinSameSideNum ? newWinRatio / 1.4 : newWinRatio / 2;
        }
        if(continuousObj.continuousLossNum > 4){
            newWinRatio = continuousWinSameSideNum ? newWinRatio / 1.43 : newWinRatio / 2;
        }
        if(continuousObj.continuousLossNum > 2){
            newWinRatio = continuousWinSameSideNum ? newWinRatio / 1.32 : newWinRatio;
        }
        if(continuousObj.continuousLossNum > 1){
            newWinRatio = continuousWinSameSideNum ? newWinRatio / 1.2 : (lastWinDirection == 'long' ? newWinRatio / 1.18 : newWinRatio);
        }
    }

    if(continuousObj.continuousWinNum){
        newWinRatio = Number(winRatio) / 5
    }

    console.log('------------continuousLossNum start---------------')
    console.log(moment().format('YYYY-MM-DD HH:mm:ss'), instrument_id, ratio, position)
    console.info('frequency', frequency, 'newWinRatio', newWinRatio, 'newLossRatio', newLossRatio, 'leverage', leverage, 'side', side)
    console.log('continuousWinNum',continuousObj.continuousWinNum, 'continuousLossNum',continuousObj.continuousLossNum)
    console.log('lastWinDirection', lastWinDirection, 'lastLastWinDirection', lastLastWinDirection)
    console.log('lastLossDirection', lastLossDirection, 'lastLastLossDirection', lastLastLossDirection)
    console.log('continuousWinSameSideNum',continuousWinSameSideNum,'continuousLossSameSideNum',continuousLossSameSideNum)
    console.log('lastMostWinRatio',lastMostWinRatio)
    console.log('------------continuousLossNum end---------------')

    if(ratio > 0){
        lastMostWinRatio = Math.max(lastMostWinRatio,ratio)
        if(
            ratio < condition * newWinRatio * frequency / 10
            &&
            lastMostWinRatio > condition * newWinRatio * frequency * 1.8 / 4
            &&
            continuousLossSameSideNum == 1

        ){
            if(isHalf || (Number(holding.position) == Number(initPosition) * 2)){
                await closeHalfPosition(holding, mark_price)
            }else{
                await autoCloseOrderByMarketPriceByHolding(holding);
            }
            positionChange = true

            lastMostWinRatio = 0;

            const openSide = side == 'long' ? 'short' : 'long';
            const payload = {
                openSide,
                lossNum: continuousObj.continuousLossNum,
                continuousWinSameSideNum,
                continuousLossSameSideNum
            }
            await autoOpenOrderSingle(payload);

        }
    }

    if(ratio > condition * newWinRatio * frequency){
        if(isHalf || (Number(holding.position) == Number(initPosition) * 2)){
            await closeHalfPosition(holding, mark_price)
        }else{
            await autoCloseOrderByMarketPriceByHolding(holding);
        }
        positionChange = true
        await afterWin(holding)
        return;
    }
    if(ratio < - condition * newLossRatio * frequency){
        if(isHalf || (Number(holding.position) == Number(initPosition) * 2)){
            await closeHalfPosition(holding, mark_price)
        }else{
            await autoCloseOrderByMarketPriceByHolding(holding);
        }
        positionChange = true
        await afterLoss(holding)
        return;
    }
}

// function startInterval() {
//     if(myInterval) return myInterval;
//     return setInterval(async ()=>{
//         console.log('moment', moment().format('YYYY-MM-DD HH:mm:ss'))
//
//         const { holding: btcHolding } = await authClient.swap().getPosition(BTC_INSTRUMENT_ID);
//         const { mark_price } = await cAuthClient.swap.getMarkPrice(BTC_INSTRUMENT_ID);
//         // const { holding: eosHolding } = await authClient.swap().getPosition(EOS_INSTRUMENT_ID);
//
//         const btcQty = Number(btcHolding[0].position);
//         // const eosQty = Number(eosHolding[0].position);
//
//         const qty = btcQty;
//         if(!qty) {
//             return;
//         }
//         // if(btcQty) getOrderModeSingle(mode,  btcHolding[0]);
//         if(btcHolding.length > 1 && isOpenOtherOrder && Number(btcHolding[1].position)){
//             let mainHolding = btcHolding[0]
//             let otherHolding = btcHolding[1]
//
//             if(!curOtherPositionIndex){
//                 mainHolding = btcHolding[1]
//                 otherHolding = btcHolding[0]
//             }
//             console.log('timestamp',btcHolding[0].timestamp,'timestamp',btcHolding[1].timestamp)
//
//             await autoOtherOrder(otherHolding,mark_price)
//             await autoOperateSwap(mainHolding,mark_price)
//
//             // setTimeout(async () => {
//             //     const { holding: btcHolding } = await authClient.swap().getPosition(BTC_INSTRUMENT_ID);
//             //     const { mark_price } = await cAuthClient.swap.getMarkPrice(BTC_INSTRUMENT_ID);
//             //
//             //     let mainHolding = btcHolding[0]
//             //     // let otherHolding = btcHolding[1]
//             //
//             //     if(!curOtherPositionIndex){
//             //         mainHolding = btcHolding[1]
//             //         // otherHolding = btcHolding[0]
//             //     }
//             //
//             //     await autoOperateSwap(mainHolding,mark_price)
//             //
//             //     console.log('timestamp',btcHolding[0].timestamp,'timestamp',btcHolding[1].timestamp)
//             // }, 1000)
//             return
//         }
//         if(btcQty) {
//             console.log('one-timestamp',btcHolding[0].timestamp,'timestamp',btcHolding[0].timestamp)
//             curOtherPositionIndex = 0
//             if(isOpenOtherOrder){
//                 await autoOtherOrder(btcHolding[0],mark_price, true)
//                 await autoOperateSwap(btcHolding[0],mark_price)
//
//                 // if(btcQty == initPosition * 2){
//                 //     setTimeout(async () => {
//                 //         const { holding: btcHolding } = await authClient.swap().getPosition(BTC_INSTRUMENT_ID);
//                 //         const { mark_price } = await cAuthClient.swap.getMarkPrice(BTC_INSTRUMENT_ID);
//                 //         await autoOperateSwap(btcHolding[0],mark_price)
//                 //
//                 //         console.log('one-timestamp',btcHolding[0].timestamp,'timestamp',btcHolding[0].timestamp)
//                 //     }, 1000)
//                 // }
//             }else{
//                 await autoOperateSwap(btcHolding[0],mark_price)
//             }
//         }
//         // if(isOpenOtherOrder && btcHolding[1] && Number(btcHolding[1].position)) await autoOtherOrder(btcHolding[1],mark_price)
//     },1000 * 2)
// }

let positionChange = true;
let globalBtcHolding = null;
const startInterval = async () => {
    console.log('******************moment******************', moment().format('YYYY-MM-DD HH:mm:ss'))

    let btcHolding = globalBtcHolding
    if(positionChange){
        const { holding: tempBtcHolding } = await authClient.swap().getPosition(BTC_INSTRUMENT_ID);
        globalBtcHolding = tempBtcHolding
        btcHolding = globalBtcHolding
        positionChange = false
    }
    const { mark_price } = await cAuthClient.swap.getMarkPrice(BTC_INSTRUMENT_ID);

    const btcQty = Number(btcHolding[0].position);
    console.log('btcQty',btcQty, initPosition)
    // console.log(btcHolding[0])
    if(btcQty) {
        if(btcHolding.length > 1 && Number(btcHolding[1].position)){
            let mainHolding = btcHolding[0]
            let otherHolding = btcHolding[1]

            if(otherPositionSide == btcHolding[0].side){
                mainHolding = btcHolding[1]
                otherHolding = btcHolding[0]
            }
            console.log('timestamp','mainHolding',mainHolding.timestamp,primaryPrice, mainHolding.side)
            console.log('timestamp','otherHolding',otherHolding.timestamp,otherPositionPrimaryPrice, otherHolding.side)
            console.log('otherPositionSide',otherPositionSide)
            console.log('isOpenOtherOrder', isOpenOtherOrder)

            await autoOtherOrder(otherHolding,mark_price)
            await autoOperateSwap(mainHolding,mark_price)
        }else{
            console.log('one-timestamp',btcHolding[0].timestamp,'timestamp',btcHolding[0].timestamp)
            console.log('primaryPrice', primaryPrice)
            console.log('otherPositionPrimaryPrice', otherPositionPrimaryPrice)
            console.log('otherPositionSide',otherPositionSide)
            console.log('isOpenOtherOrder', isOpenOtherOrder)
            console.log(btcQty == Number(initPosition) * 2)
            if(isOpenOtherOrder && (btcQty == Number(initPosition) * 2)){
                await autoOtherOrder(btcHolding[0],mark_price, true)
                await autoOperateSwap(btcHolding[0],mark_price, true)
            }else{
                await autoOperateSwap(btcHolding[0],mark_price)
            }
        }

        await waitTime()
        await startInterval()
    }
}

function stopInterval() {
    if(myInterval) {
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

// 定时获取交割合约账户信息
// myInterval = startInterval()
// myInterval = setTimeout(startInterval,1000 * 2)
(async ()=>{
    await startInterval()
})()
app.listen(8091);

console.log('8091 server start');
