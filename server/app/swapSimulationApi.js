import request from '../utils/request';
import moment from 'moment'

// const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');
const customAuthClient = require('./customAuthClient');

const fs = require('fs');

//读取配置文件，变量config的类型是Object类型
// let dataConfig = require('./configETH.json');

let EOS_INSTRUMENT_ID = "EOS-USD-SWAP";
let myInterval;
let mode = 4; //下单模式

let frequency = 1;
const winRatio = 2;
const lossRatio = 9;
let LEVERAGE = 10
let initPosition = LEVERAGE * 5 * 3 * 1.0;
// let initPosition = LEVERAGE * 10 / 2;

const continuousMap = {
    [EOS_INSTRUMENT_ID]: {
        continuousLossNum: 0,
        continuousWinNum: 0,
        continuousBatchNum: 0,
        continuousProfitNum: 0,
        continuousTripleLossNum: 0,
        otherContinuousWinNum: 0
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
    const { openSide = 'long', position = Number(initPosition)} = params;
    const type = openSide == 'long' ? 1 : 2;
    console.log('openOtherOrderMoment', openSide, moment().format('YYYY-MM-DD HH:mm:ss'))
    console.log('position', position, 'type', type, 'side', openSide)

    const instrument_id = EOS_INSTRUMENT_ID;
    const payload = {
        size: position,
        type,
        order_type: 4, //1：只做Maker 4：市价委托
        instrument_id,
        // price: mark_price,
        // match_price: 0
    }

    try{
        await authClient.swap().postOrder(payload)
        positionChange = true
    }catch (e) {
        console.log(e)
    }
}

// 开仓，availRatio开仓比例
const autoOpenOrderSingle = async (params = {}) => {
    const { openSide = 'long', lossNum = 0, winNum = 0, continuousWinSameSideNum = 0, continuousLossSameSideNum = 0, } = params;
    let changeRatio = 1;

    changeRatio = changeRatio > 0 ? changeRatio : 1
    let positionRatio = changeRatio

    const position = Math.ceil(Number(initPosition) * positionRatio)

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
    const instrument_id = EOS_INSTRUMENT_ID;
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

        try{
            await authClient.swap().postOrder(payload)

            const { mark_price } = await cAuthClient.swap.getMarkPrice(instrument_id);
            primaryPrice = Number(mark_price)
            primarySide = openSide
        }catch (e) {
            console.log(e)
        }

        return true;
    }
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
const getAvailNo = async ({val = 100, currency = 'BTC-USD', instrument_id = EOS_INSTRUMENT_ID, mark_price}) => {
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
        otherContinuousWinNum,
        otherContinuousLossNum,
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
        primarySide: pside,
        primaryPrice: pp,
    } = query;
    const continuousObj = continuousMap[instrument_id];
    continuousObj.continuousLossNum = Number(continuousLossNum);
    continuousObj.continuousWinNum = Number(continuousWinNum);
    continuousObj.otherContinuousWinNum = Number(otherContinuousWinNum);
    continuousObj.otherContinuousLossNum = Number(otherContinuousLossNum);
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
    primarySide = pside
    primaryPrice = pp

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
            otherPositionLoss: otpl,
            primarySide: pside,
            primaryPrice: pp
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
let primarySide = 'long';
let otherPositionPrimaryPrice = 0;
let otherFromPrimary = false
const afterWin = async (holding, ratio) => {
    const { instrument_id, side } = holding;
    const continuousObj = continuousMap[instrument_id];

    continuousObj.continuousLossNum = 0;
    continuousObj.continuousWinNum = continuousObj.continuousWinNum + 1;

    let isOpenShort = side == 'short';

    // if(continuousObj.continuousWinNum >= 4){
    //     isOpenShort = !isOpenShort
    //     continuousObj.continuousWinNum = 0;
    // }

    const openSide = isOpenShort ? 'short' : 'long';
    const payload = {
        openSide,
        lossNum: continuousObj.continuousLossNum,
        winNum: continuousObj.continuousWinNum,
        continuousWinSameSideNum,
        continuousLossSameSideNum
    }
    primarySide = openSide
    await autoOpenOrderSingle(payload);

}
const afterLoss = async (holding,type) =>{
    const { instrument_id, side } = holding;
    const continuousObj = continuousMap[instrument_id];

    continuousObj.continuousLossNum = continuousObj.continuousLossNum + 1;
    continuousObj.continuousWinNum = 0;

    let isOpenShort = side == 'short';

    // if(continuousObj.continuousLossNum >= 2){
    //     isOpenShort = !isOpenShort
    // }

    lastLastLossDirection = lastLossDirection;
    lastLossDirection = side;

    lastMostWinRatio = 0;

    let openSide = isOpenShort ? 'short' : 'long';
    const payload = {
        openSide,
        lossNum: continuousObj.continuousLossNum,
        winNum: continuousObj.continuousWinNum,
        continuousWinSameSideNum,
        continuousLossSameSideNum
    }
    primarySide = openSide
    await autoOpenOrderSingle(payload);

}
// 平半仓
const closeHalfPosition = async (holding, oldPosition = initPosition) => {
    // const { holding: realBtcHolding } = await authClient.swap().getPosition(EOS_INSTRUMENT_ID);
    // if(realBtcHolding && realBtcHolding[0] && Number(realBtcHolding[0].position)){
    const { instrument_id, position, side } = holding;

    const payload = {
        size: Math.ceil(Number(position)),
        type: side == 'long' ? 3 : 4,
        instrument_id,
        order_type: 4,
        // price: mark_price,
        // match_price: 0
    }

    await authClient.swap().postOrder(payload)
    positionChange = true
    // }
}
let otherPositionLoss = false
let otherPositionSide = null
const autoOtherOrder = async (holding,mark_price,isHalf = false) => {
    const { instrument_id, last, leverage, position: originPosition, avg_cost, margin: originMargin, side } = holding;

    otherPositionPrimaryPrice = otherPositionPrimaryPrice || Number(avg_cost)

    // const position = isHalf ? Math.floor(Number(originPosition) * (initPosition + 1) / ( 2 * initPosition + 1 ) ) : Number(originPosition)

    let ratio = (Number(mark_price) - Number(otherPositionPrimaryPrice)) * Number(leverage) / Number(mark_price);
    if(side=='short') ratio = -ratio;
    ratio = isNaN(ratio) ? 0 : ratio
    const condition = Number(leverage) / 100;

    const continuousObj = continuousMap[instrument_id];

    let newWinRatio = LEVERAGE / 10 * 0.4
    let newLossRatio = Number(lossRatio)

    // if(continuousObj.continuousLossNum){
    //     newWinRatio = Number(lossRatio) * 0.8 * 1.2 * 1.2
    //     newLossRatio = Number(lossRatio) * 2.5 * 1.2
    // }
    //
    // if(
    //     (continuousObj.otherContinuousWinNum == 3 && otherPositionSide == 'short' && primarySide == 'short')
    //     ||
    //     continuousObj.otherContinuousWinNum > 3
    //     ||
    //     continuousObj.otherContinuousLossNum > 1
    //     // ||
    //     // otherFromPrimary
    // ){
    //     newLossRatio = Number(lossRatio) * 1.2
    // }
    const consoleOtherFn = () => {
        console.log('@@@@@@@@@other other close start@@@@@@@@@')
        console.log(instrument_id, ratio, originPosition, moment().format('YYYY-MM-DD HH:mm:ss'))
        console.info('frequency', frequency, 'newWinRatio', newWinRatio, 'newLossRatio', newLossRatio, 'leverage', leverage, 'side', side,)
        console.log('otherPositionPrimaryPrice', otherPositionPrimaryPrice, 'mark_price', mark_price)
        console.log('otherPositionLoss',otherPositionLoss,'isHalf',isHalf)
        console.log('continuousWinNum',continuousObj.continuousWinNum, 'continuousLossNum',continuousObj.continuousLossNum)
        console.log('lastWinDirection', lastWinDirection, 'lastLastWinDirection', lastLastWinDirection)
        console.log('lastLossDirection', lastLossDirection, 'lastLastLossDirection', lastLastLossDirection)
        console.log('continuousWinSameSideNum',continuousWinSameSideNum,'continuousLossSameSideNum',continuousLossSameSideNum)
        console.log('lastMostWinRatio',lastMostWinRatio)
        console.log('@@@@@@@@@other other close end@@@@@@@@@@@@@')
    }

    if(ratio > condition * newWinRatio * frequency) {
        consoleOtherFn()
        positionChange = true
        isOpenOtherOrder = false
        otherPositionLoss = false
        otherPositionPrimaryPrice = 0

        continuousObj.otherContinuousWinNum = continuousObj.otherContinuousWinNum + 1
        continuousObj.otherContinuousLossNum = 0;

        if(isHalf || (Number(holding.position) > Number(initPosition) * 1)){
            await closeHalfPosition(holding, Number(initPosition) + 1)
        }else{
            // await autoCloseOrderByMarketPriceByHolding(holding);
            await closeHalfPosition(holding, Number(originPosition))
        }

        // if(continuousObj.continuousLossNum || !continuousObj.continuousWinNum){
        //     let openSide = side == 'long' ? 'long' : 'short'
        //     if(continuousObj.otherContinuousWinNum > 3) {
        //         openSide = side == 'short' ? 'long' : 'short'
        //         continuousObj.otherContinuousWinNum = 0
        //     }
        //     const payload = {
        //         openSide,
        //         lossNum: continuousObj.continuousLossNum,
        //         winNum: continuousObj.continuousWinNum,
        //         continuousWinSameSideNum,
        //         continuousLossSameSideNum
        //     }
        //     isOpenOtherOrder = true
        //     otherPositionLoss = true
        //     otherFromPrimary = false
        //     await autoOpenOtherOrderSingle(payload);
        // }
    }
    if(ratio < - condition * newLossRatio * frequency){
        consoleOtherFn()
        positionChange = true
        isOpenOtherOrder = false
        otherPositionLoss = false
        otherPositionPrimaryPrice = 0
        continuousObj.otherContinuousWinNum = 0
        continuousObj.otherContinuousLossNum = continuousObj.otherContinuousLossNum + 1

        if(isHalf || (Number(holding.position) > Number(initPosition))){
            await closeHalfPosition(holding, Number(initPosition) + 1)
        }else{
            // await autoCloseOrderByMarketPriceByHolding(holding);
            await closeHalfPosition(holding, Number(originPosition))
        }

        // if(continuousObj.continuousLossNum){
        //     let openSide = side == 'short' ? 'long' : 'short';
        //
        //     const payload = {
        //         openSide,
        //         lossNum: continuousObj.continuousLossNum,
        //         winNum: continuousObj.continuousWinNum,
        //         continuousWinSameSideNum,
        //         continuousLossSameSideNum
        //     }
        //     isOpenOtherOrder = true
        //     otherPositionLoss = true
        //     otherFromPrimary = false
        //     await autoOpenOtherOrderSingle(payload);
        // }
    }
}
const getPowByNum = (total, n) => {
    let index = 0;
    // while(Math.pow(2,index) != total / n){
    while(Math.pow(2,index) != total / n){
        index++;
    }
    return index
}
const autoOneSideSwap = async (holding,mark_price) => {
    const { avg_cost, position, side, leverage, instrument_id, last } = holding

    let ratio = Number(mark_price) * 2 / (Number(avg_cost) + Number(last));

    let lossRatio = (Number(mark_price) - Number(avg_cost)) * Number(leverage) / Number(mark_price);
    if(side=='short') lossRatio = -lossRatio;

    // let newWinRatio = Number(leverage) * 1.25 / 10 / 10
    const newMaxRatio = 0.85

    if(lossRatio < - newMaxRatio){
        const lossPayload = {
            openSide: side,
            position: Number(position)
        }
        await autoOpenOtherOrderSingle(lossPayload);
        return
    }

    if(lossRatio > 0.01){
        if(Number(position) > Number(initPosition)){
            await closeHalfPosition(holding);
        }else{
            const lossPayload = {
                openSide: side == 'long' ? "short" : 'long',
                position: Number(position)
            }
            await autoOpenOtherOrderSingle(lossPayload);
            openMarketPrice = mark_price
            await writeData()
        }
        return;
    }

    if(Number(position) > Number(initPosition)){
        if(
            (side=='long' && ratio > 1)
            ||
            (side=='short' && ratio < 1)

        ){
            holding.position = Number(holding.position) / 2
            await closeHalfPosition(holding);
            return
        }
    }

}
const autoOperateSwap = async ([holding1,holding2],mark_price,isHalf=false) => {
    const { side: side1, leverage: leverage1, avg_cost: avg_cost1, position: position1 } = holding1;
    let ratio1 = (Number(mark_price) - Number(openMarketPrice)) * Number(leverage1) / Number(mark_price);
    let realRatio1 = (Number(mark_price) - Number(avg_cost1)) * Number(leverage1) / Number(mark_price);
    const { side: side2, leverage: leverage2, avg_cost: avg_cost2, } = holding2;
    let ratio2 = (Number(mark_price) - Number(openMarketPrice)) * Number(leverage2) / Number(mark_price);
    let realRatio2 = (Number(mark_price) - Number(avg_cost2)) * Number(leverage2) / Number(mark_price);

    if(side1=='short') {
        ratio1 = -ratio1;
        realRatio1 = -realRatio1
    }
    ratio1 = isNaN(ratio1) ? 0 : ratio1

    if(side2=='short') {
        ratio2 = -ratio2;
        realRatio2 = -realRatio2
    }
    ratio2 = isNaN(ratio2) ? 0 : ratio2

    let winHolding = holding1
    let winRatio = ratio1

    let lossHolding = holding2
    let lossRatio = ratio2
    if(
        (ratio2 > ratio1)
    ){
        lossHolding = holding1
        lossRatio = ratio1

        winRatio = ratio2
        winHolding = holding2
    }

    const { position, side, leverage, avg_cost, last } = lossHolding

    // const batchRatioList = [1,2,3,5,8,13,21,34,55,89]
    const batchRatioList = [1,3*1.2,5*1.2,8*1.2,13*1.2,21*1.2]
    const curIndex = batchRatioList.findIndex(item=>item == Math.ceil(Number(lossHolding.position) / Number(initPosition)))
    const maxLossRatio = 0.85
    const minWinRatio = 0.005

    // console.log(openMarketPrice)
    // console.log(winRatio,lossRatio,winHolding.position,lossHolding.position)

    if(
        realRatio1 > minWinRatio
        &&
        realRatio2 > minWinRatio
    ){
        await closeHalfPosition(winHolding);
        await closeHalfPosition(lossHolding);
        return;
    }

    if(
        realRatio1 < - maxLossRatio
        ||
        realRatio2 < - maxLossRatio
    ){
        await closeHalfPosition(winHolding);
        // await closeHalfPosition(lossHolding);
        const lossPayload = {
            openSide: lossHolding.side,
            position: Number(winHolding.position)
        }
        await autoOpenOtherOrderSingle(lossPayload);
        return
    }

    if(curIndex == batchRatioList.length - 1) return

    const ratioList = [0.382,0.5,0.618,0.809,0.1]
    const newLossRatio = ratioList[curIndex]

    if(lossRatio < - newLossRatio){
        if(Number(lossHolding.position) < batchRatioList[curIndex+1] * Number(initPosition)){
            const lossPayload = {
                openSide: lossHolding.side,
                position: batchRatioList[curIndex+1] * Number(initPosition) - Number(lossHolding.position)
            }
            await autoOpenOtherOrderSingle(lossPayload);
            return
        }
    }

}

const writeData = async () => {
    //将修改后的配置写入文件前需要先转成json字符串格式
    const continuousObj = continuousMap[EOS_INSTRUMENT_ID];

    let dataConfig = {
        "openMarketPrice": openMarketPrice.toString(),
    }
    let jsonStr = JSON.stringify(dataConfig);
    // console.log(jsonStr)

    const result = await new Promise(resolve=>{
        //将修改后的内容写入文件
        fs.writeFile('./app/configETH.json', jsonStr, function(err) {
            if (err) {
                console.error(err);
            }else{
                console.log('----------修改成功-------------');
                resolve(true)
            }
        });
    })

    return result
}

// let isInit = true
const readData = async () => {
    // if(!isInit){
    let dataConfig =  JSON.parse(fs.readFileSync('./app/configETH.json','utf-8'));

    // const continuousObj = continuousMap[EOS_INSTRUMENT_ID];
    // continuousObj.continuousWinNum = Number(dataConfig.continuousWinNum)
    // continuousObj.continuousLossNum = Number(dataConfig.continuousLossNum)
    // continuousObj.otherContinuousWinNum = Number(dataConfig.otherContinuousWinNum)
    // continuousObj.otherContinuousLossNum = Number(dataConfig.otherContinuousLossNum)
    // lastWinDirection = dataConfig.lastWinDirection
    // lastLastWinDirection = dataConfig.lastLastWinDirection
    // lastLossDirection = dataConfig.lastLossDirection
    // lastLastLossDirection = dataConfig.lastLastLossDirection
    // continuousWinSameSideNum = Number(dataConfig.continuousWinSameSideNum)
    // continuousLossSameSideNum = Number(dataConfig.continuousLossSameSideNum)
    // lastMostWinRatio = Number(dataConfig.lastMostWinRatio)
    // isOpenOtherOrder = dataConfig.isOpenOtherOrder == true || dataConfig.isOpenOtherOrder == 'true' ? true : false
    // otherPositionSide = dataConfig.otherPositionSide
    // otherPositionPrimaryPrice = Number(dataConfig.otherPositionPrimaryPrice)
    // otherPositionLoss = dataConfig.otherPositionLoss == true || dataConfig.otherPositionLoss == 'true' ? true : false
    // primaryPrice = Number(dataConfig.primaryPrice)
    // primarySide = dataConfig.primarySide

    openMarketPrice = dataConfig.openMarketPrice

    console.log('read::dataConfig',dataConfig,moment().format('YYYY-MM-DD HH:mm:ss'))
    // }
}

let positionChange = true;
let isOpenMarketPriceChange = true
let globalBtcHolding = null;
let openMarketPrice = 0
const startInterval = async () => {
    const { mark_price } = await cAuthClient.swap.getMarkPrice(EOS_INSTRUMENT_ID);

    let btcHolding = globalBtcHolding
    if(positionChange){
        try{
            console.log('******************moment******************', moment().format('YYYY-MM-DD HH:mm:ss'))
            const { holding: tempBtcHolding } = await authClient.swap().getPosition(EOS_INSTRUMENT_ID);
            btcHolding = tempBtcHolding
            if(!btcHolding || !btcHolding[0] || !Number(btcHolding[0].position)){
                openMarketPrice = mark_price
                await autoOpenOtherOrderSingle({ openSide: "long" })
                await autoOpenOtherOrderSingle({ openSide: "short" })
                await writeData()
            }else {
                if(isOpenMarketPriceChange){
                    // const { order_info } = await authClient.swap().getOrders(EOS_INSTRUMENT_ID, {state: 2, limit: 1})
                    // const { price_avg } = order_info[0]
                    // openMarketPrice = price_avg
                    await readData()
                }
            }

            globalBtcHolding = btcHolding
            // positionChange = false
            isOpenMarketPriceChange = false
        }catch (e){
            console.log(e)
        }
        // isInit = false
    }else{
        if(!btcHolding || !btcHolding[0] || !Number(btcHolding[0].position)){
            const { holding: tempBtcHolding } = await authClient.swap().getPosition(EOS_INSTRUMENT_ID);
            btcHolding = tempBtcHolding
            globalBtcHolding = btcHolding
        }
    }

    const btcQty = (btcHolding && btcHolding[0]) ? Number(btcHolding[0].position) : 0;
    // console.log('btcQty',btcQty, initPosition)

    if(btcQty) {
        if(btcHolding.length > 1 && Number(btcHolding[1].position)){
            let mainHolding = btcHolding[0]
            let otherHolding = btcHolding[1]
            // if(positionChange
            //     &&
            //     (Number(btcHolding[0].position) > Number(initPosition) || Number(btcHolding[1].position) > Number(initPosition))
            //     ){
            //     const { order_info } = await authClient.swap().getOrders(EOS_INSTRUMENT_ID, {state: 2, limit: 1})
            //     const { price_avg: last, type } = order_info[0]
            //
            //     if(Number(type) < 3){
            //         if(Number(mainHolding.position) > Number(initPosition)){
            //             mainHolding.last = last
            //         }else{
            //             otherHolding.last = last
            //         }
            //     }else{
            //         if(Number(mainHolding.position) > Number(initPosition)){
            //             mainHolding.last = mainHolding.avg_cost
            //         }else{
            //             otherHolding.last = otherHolding.avg_cost
            //         }
            //     }
            // }
            positionChange = false
            await autoOperateSwap([mainHolding,otherHolding],mark_price)
        }else{
            if(positionChange){
                const { order_info } = await authClient.swap().getOrders(EOS_INSTRUMENT_ID, {state: 2, limit: 1})
                const { price_avg: last, type } = order_info[0]

                if(Number(type) < 3){
                    btcHolding[0].last = last
                }else{
                    btcHolding[0].last = btcHolding[0].avg_cost
                }
            }
            positionChange = false
            await autoOneSideSwap(btcHolding[0],mark_price)
        }
        await waitTime()
        await startInterval()
    }else{
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
(async ()=>{
    await startInterval()
})()
app.listen(8092);

console.log('8092 server start');
