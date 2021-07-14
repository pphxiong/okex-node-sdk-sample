import request from '../utils/request';
import moment from 'moment'

// const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');
const customAuthClient = require('./customAuthClientV5');
const customAuthClientBN = require('./customAuthClientBN');

const fs = require('fs');

//读取配置文件，变量config的类型是Object类型
// let dataConfig = require('./configETH.json');

let ETH_INSTRUMENT_ID = "ETH-USDT-SWAP";
const BN_SYMBOL = "ETHUSDT";
let myInterval;
let mode = 4; //下单模式

let frequency = 1;
const winRatio = 2;
const lossRatio = 9;
let LEVERAGE = 20;
let initPosition = 1;
// let initPosition = LEVERAGE * 10 / 2;

const continuousMap = {
    [ETH_INSTRUMENT_ID]: {
        continuousLossNum: 0,
        continuousWinNum: 0,
        continuousBatchNum: 0,
        continuousProfitNum: 0,
        continuousTripleLossNum: 0,
        otherContinuousWinNum: 0
    },
};

var config = require('./configV5');
var configBN = require('./configBN');
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
const cAuthClientBN = new customAuthClientBN(
    configBN.httpkey,
    configBN.httpsecret,
    configBN.urlHost
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
const autoCloseOrderByMarketPriceByHolding =  async ({ instrument_id, side  }) => {
    await validateAndCancelOrder({instrument_id});
    return await cAuthClient.swap.closePosition({instrument_id, direction: side })
}

// 检测是否有未成交的挂单， state：2 完全成交， 6： 未完成， 7： 已完成
// 如果有就撤销, type: 1 撤销other单
const validateAndCancelOrder = async ({instrument_id = ETH_INSTRUMENT_ID, type = 3}) => {
    const { order_info } = await authClient.swap().getOrders(instrument_id, {state: 6, limit: 3});
    if( order_info && order_info.length ){
        const curOrder = order_info.find(item=>item.type==type);
        const { order_id, size, filled_qty } = curOrder;
        const nextQty = Math.floor(Number(size) - Number(filled_qty));
        console.log('cancelorder', instrument_id, nextQty);
        try{
            await authClient.swap().postCancelOrder(instrument_id,order_id);
        }catch (e) {
            restart();
        }
        return new Promise(resolve=>{ resolve({ result: false, nextQty }) });
    }
    return new Promise(resolve=>{ resolve({ result: true }) });
}

// 下单，并返回订单信息
const getOrderState = async (payload) => {
    const { instrument_id } = payload;
    const { order_id } = await authClient.swap().postOrder(payload);
    return await authClient.swap().getOrder(instrument_id,order_id)
}

let cancelInterval;
const autoOpenOtherOrderSingle = async (params = {}) => {
    const { openSide = 'long', position = Number(initPosition), mark_price } = params;
    const instrument_id = ETH_INSTRUMENT_ID;

    async function postOrder(size,price) {
        const type = openSide == 'long' ? 'BUY' : 'SELL';
        console.log('openOtherOrderMoment', openSide, moment().format('YYYY-MM-DD HH:mm:ss'))
        console.log('position', position, 'type', type, 'side', openSide)
        // Parameter	Value
        // symbol	LTCBTC
        // side	BUY
        // type	LIMIT
        // timeInForce	GTC
        // quantity	1
        // price	0.1
        // recvWindow	5000
        // timestamp	1499827319559

        const payload = {
            symbol: BN_SYMBOL,
            side: type,
            positionSide: openSide == 'long' ? 'LONG' : 'SHORT',
            type: 'MARKET',
            quantity: size,
            recvWindow: 5000,
            // timestamp: moment(new Date()).valueOf(),
            // timeInForce: 'GTC',
            // quantity: size,
            // posSide: openSide,
            // ordType: 'market',
            // tdMode: 'isolated',
            // price,
            // match_price: 0
        }
        try{
            await cAuthClientBN.swap.postOrder(payload)
            positionChange = true
        }catch (e) {
            // throw new Error('Error');
            restart('open');
        }
    }
    await postOrder(position,mark_price)
}

// 平仓
const closeHalfPositionByMarket = async (holding, oldPosition = initPosition) => {
    const { instrument_id = ETH_INSTRUMENT_ID, position, side, mark_price } = holding;
    async function postOrder(size,price) {
        const type = side == 'long' ? 'SELL' : 'BUY'
        const payload = {
            symbol: BN_SYMBOL,
            side: type,
            positionSide: side == 'long' ? 'LONG' : 'SHORT',
            type: 'STOP_MARKET',
            closePosition: true,
            recvWindow: 5000,
            timestamp: moment(new Date()).valueOf(),
        }
        try{
            // await validateAndCancelOrder(payload)
            await cAuthClientBN.swap.postOrder(payload)
            positionChange = true
        }catch (e) {
            // throw new Error('Error');
            restart('close');
        }
    }
    console.log('###################################')
    console.log('closePositionMoment',moment().format('YYYY-MM-DD HH:mm:ss'))
    console.log('###################################')
    await postOrder(position,mark_price)
}


// 平仓
const closeHalfPosition = async (holding, oldPosition = initPosition) => {
    // const { holding: realBtcHolding } = await authClient.swap().getPosition(ETH_INSTRUMENT_ID);
    // if(realBtcHolding && realBtcHolding[0] && Number(realBtcHolding[0].position)){
    const { instrument_id = ETH_INSTRUMENT_ID, position, side, mark_price } = holding;
    async function postOrder(size,price) {
        const payload = {
            size: Math.floor(Number(size)),
            type: side == 'long' ? 3 : 4,
            order_type: 0, //1：只做Maker, 2：全部成交或立即取消 4：市价委托
            instrument_id,
            price,
            match_price: 0
        }
        try{
            await authClient.swap().postOrder(payload)
            positionChange = true
        }catch (e) {
            // throw new Error('Error');
            restart();
        }
    }
    await postOrder(position,mark_price)
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

    const batchRatioList = [1,2,3,5,8,13,21,34]
    // const batchRatioList = [1,3*1.2,5*1.2,8*1.2,13*1.2,21*1.2]
    const curIndex = batchRatioList.findIndex(item=>Math.floor(item) == Math.floor(Number(lossHolding.position) / Number(initPosition)))
    const maxLossRatio = 0.85
    const minWinRatio = 0.01

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

    const ratioList = [0.191,0.382,0.5,0.618,0.809,0.1]
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
    const continuousObj = continuousMap[ETH_INSTRUMENT_ID];

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

    // const continuousObj = continuousMap[ETH_INSTRUMENT_ID];
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

//获取最大值的下标
function getMaxIndex(arr, key) {
    let max = arr[0];
    //声明了个变量 保存下标值
    let index = 0;
    if(key){
        max = arr[0][key]
        for (let i = 0; i < arr.length; i++) {
            if (max < arr[i][key]) {
                max = arr[i][key];
                index = i;
            }
        }
    }else{
        for (let i = 0; i < arr.length; i++) {
            if (max < arr[i]) {
                max = arr[i];
                index = i;
            }
        }
    }

    return index;
}

//获取最小值的下标
function getMinIndex(arr,key) {
    let min = arr[0];
    //声明了个变量 保存下标值
    let index = 0;
    if(key){
        min = arr[0][key]
        for (let i = 0; i < arr.length; i++) {
            if (min > arr[i][key]) {
                min = arr[i][key];
                index = i;
            }
        }
    }else{
        for (let i = 0; i < arr.length; i++) {
            if (min > arr[i]) {
                min = arr[i];
                index = i;
            }
        }
    }

    return index;
}

let positionChange = true;
let globalHolding = null;
let openMarketPrice = 0
let globalColumnsObjList;
function getMacd(params) {
    const {price,lastEma12,lastEma26,lastDea,high,low} = params

    const ema12 = toFixedAndToNumber(2/(12+1) * price + 11/(12+1) * lastEma12,4)
    const ema26 = toFixedAndToNumber(2/(26+1) * price + 25/(26+1) * lastEma26,4)

    const diff = toFixedAndToNumber(ema12 - ema26,2)
    const dea = toFixedAndToNumber(2/(9+1) * diff + 8/(9+1) * lastDea,2)

    const column = toFixedAndToNumber(2 * (diff - dea),2)

    const result = {
        price,
        ema12,
        ema26,
        diff,
        dea,
        column,
        high,
        low
    }

    return result
}
function toFixedAndToNumber(n,num=1){
    // return Number(n.toFixed(num))
    return Math.round(n * Math.pow(10,num)) / Math.pow(10,num)
}
function getRSIAverage(list,i,n){
    let diff;
    let gainI = 0;
    let lossI = 0;
    if(i==0) {
        diff = 0;
    }else{
        diff = Number(list[i]) - Number(list[i-1])
        if(diff > 0){
            gainI = Math.max(0,diff)
        }else{
            lossI = Math.max(0,-diff)
        }
    }

    let gainAverageI;
    let lossAverageI;

    if(i==0) {
        gainAverageI = gainI;
        lossAverageI = lossI;
    }else{
        const lastRSIAverage = getRSIAverage(list,i-1,n);
        gainAverageI = (gainI + (n-1) * lastRSIAverage.gainAverageI) / n;
        lossAverageI = (lossI + (n-1) * lastRSIAverage.lossAverageI) / n;
    }

    // console.log('gain','loss',gainAverageI,lossAverageI)
    return {
        gainAverageI,
        lossAverageI,
    }
}
function getRSIByPeriod(newList, period){
    const result = getRSIAverage(newList,newList.length-1,period)
    const { gainAverageI, lossAverageI } = result
    // const RSI = gainAverageI / (gainAverageI + lossAverageI) * 100
    const RS = gainAverageI / lossAverageI;
    const RSI = 100 - 100 / (1 + RS);
    const newResult = {
        RSI: toFixedAndToNumber(RSI,2),
        gainAverageI,
        lossAverageI
    }
    return newResult;
}
function getRSI(price,list){
    const { RSI: RSI1 } = getRSIByPeriod(list,6)
    const { RSI: RSI2 } = getRSIByPeriod(list,12)
    const { RSI: RSI3 } = getRSIByPeriod(list,24)

    const result = {
        price,
        RSI1,
        RSI2,
        RSI3
    }
    return result
}
//计算向量叉乘
function crossMul(v1,v2){
    return v1.x*v2.y-v1.y*v2.x;
}
//判断两条线段是否相交
function checkCross(p1,p2,p3,p4){
    let v1={x:p1.x-p3.x,y:p1.y-p3.y},
        v2={x:p2.x-p3.x,y:p2.y-p3.y},
        v3={x:p4.x-p3.x,y:p4.y-p3.y},
        v=crossMul(v1,v3)*crossMul(v2,v3)
    v1={x:p3.x-p1.x,y:p3.y-p1.y}
    v2={x:p4.x-p1.x,y:p4.y-p1.y}
    v3={x:p2.x-p1.x,y:p2.y-p1.y}
    return (v<=0&&crossMul(v1,v3)*crossMul(v2,v3)<=0)?true:false
}
function isTripleDown(list){
    return list.every(item=>item.RSI1<item.RSI2);
}
function isTripleUp(list){
    return list.every(item=>item.RSI1>item.RSI2);
}
function isGoldOverLapping(list, index){
    // let isOverLapping = false
    const isOverLapping = list.every(item=>/* item.RSI1 >= item.RSI2 && */ item.RSI2 >= item.RSI3)
    // if(
    //     // ((list[0].RSI1 <= list[0].RSI2 && list[0].RSI2 <= list[0].RSI3)
    //     // ||
    //     list[1].RSI1 >= list[1].RSI2 && list[1].RSI2 >= list[1].RSI3
    //     &&
    //     list[2].RSI1 >= list[2].RSI2 && list[2].RSI2 >= list[2].RSI3
    // ){
    //     const point1 = {
    //         x: index,
    //         y: list[0].RSI1
    //     }
    //     const point2 = {
    //         x: index + 2,
    //         y: list[2].RSI1
    //     }
    //     const point3 = {
    //         x: index,
    //         y: list[0].RSI2,
    //     }
    //     const point4 = {
    //         x: index + 2,
    //         y: list[2].RSI2
    //     }
    // if(checkCross(point1,point2,point3,point4)){
    //     isOverLapping = true
    // }
    // }
    const overlappingObj = {
        isOverLapping,
        overlappingIndex: index,
        overlappingObj: list[0],
    }
    return overlappingObj
}
function isDeadOverLapping(list,index){
    // let isOverLapping = false
    const isOverLapping = list.every(item=>/* item.RSI1 <= item.RSI2 && */ item.RSI2 <= item.RSI3)
    // if(
    //     // ((list[0].RSI1 >= list[0].RSI2 && list[0].RSI2 >= list[0].RSI3)
    //     // ||
    //     list[0].RSI1 <= list[0].RSI2 && list[0].RSI2 <= list[0].RSI3
    //     &&
    //     list[1].RSI1 <= list[1].RSI2 && list[1].RSI2 <= list[1].RSI3
    //     &&
    //     list[2].RSI1 <= list[2].RSI2 && list[2].RSI2 <= list[2].RSI3
    // ){
    //     const point1 = {
    //         x: index,
    //         y: list[0].RSI1
    //     }
    //     const point2 = {
    //         x: index + 2,
    //         y: list[2].RSI1
    //     }
    //     const point3 = {
    //         x: index,
    //         y: list[0].RSI2,
    //     }
    //     const point4 = {
    //         x: index + 2,
    //         y: list[2].RSI2
    //     }
    //     // if(checkCross(point1,point2,point3,point4)){
    //         isOverLapping = true
    //     // }
    // }
    const overlappingObj = {
        isOverLapping,
        overlappingIndex: index,
        overlappingObj: list[0]
    }
    return overlappingObj
}
function getAverage(list){
    let sum=0;
    for(let i = 0; i < list.length; i++){
        sum += list[i];
    }
    let mean  = sum / list.length;
    return mean
}
let lastLongMaxWinRatio = 0
let lastShortMaxWinRatio = 0
function getFuturePrice(holding,ratio,direction = 1) {
    const { leverage, avg_cost } = holding;
    return Number(avg_cost) * Number(leverage) / (Number(leverage) - ratio * direction) ;
}
const startInterval = async () => {
    const payload = {
        bar: '15m',
        // limit: 100,
    }

    try{
        const { data } = await cAuthClient.swap.getHistory('ETH-USDT-SWAP', payload)
        globalColumnsObjList = data.reverse()
        // globalColumnsObjList = data
    }catch (e) {
        // if(!Array.isArray(data)) throw new Error('Data is not array!');
        restart()
    }

    if(Array.isArray(globalColumnsObjList)){
        let mark_price;
        try{
            const { data }= await cAuthClient.swap.getMarkPrice(ETH_INSTRUMENT_ID);
            mark_price = Number(data[0].markPx);
        }catch (e) {
            // if(!mark_result) throw new Error('mark_price is null!');
            restart('getMarkPrice')
        }

        // const allList = globalColumnsObjList.concat([0,0,0,0,Number(mark_price)])
        const allList = globalColumnsObjList
        let macdList = []
        allList.map((item,index)=>{
            let result = {}
            if(index==0) {
                result = {
                    price: Number(item[4]),
                    ema12: Number(item[4]),
                    ema26: Number(item[4]),
                    diff: 0,
                    dea: 0,
                    column: 0,
                    high: Number(item[2]),
                    low: Number(item[3])
                }
            }else{
                const lastResult = macdList[macdList.length-1]
                const payload = {
                    price: Number(item[4]),
                    lastEma12: lastResult.ema12,
                    lastEma26: lastResult.ema26,
                    lastDea: lastResult.dea,
                    high: Number(item[2]),
                    low: Number(item[3]),
                }
                result = getMacd(payload)
            }

            macdList.push(result)
        })

        macdList = macdList.slice(-15)

        // let lowestMacd = {};
        // let highestMacd = {};
        // let lowestDiff = {};
        // let highestDiff = {};
        // macdList.reduce((pre,cur,index)=>{
        //     if(index == 1) {
        //         lowestMacd = { index: 0, macd: pre };
        //         highestMacd = { index: 0, macd: pre };
        //         lowestDiff = { index: 0, macd: pre };
        //         highestDiff = { index: 0, macd: pre };
        //     }
        //     if(cur.low <= lowestMacd.macd.low) {
        //         lowestMacd = { index, macd: cur };
        //     }
        //     if(cur.high >= highestMacd.macd.high){
        //         highestMacd = { index, macd: cur };
        //     }
        //     if(cur.diff <= lowestDiff.macd.diff) {
        //         lowestDiff = { index, macd: cur };
        //     }
        //     if(cur.diff >= highestDiff.macd.diff){
        //         highestDiff = { index, macd: cur };
        //     }
        //     return cur;
        // })

        let columnsObjList = []
        // const newAllList = allList.concat([[0,0,0,0,Number(mark_price)]])
        const newAllList = allList
        function* gen() {
            for(let i = 0; i < 3; i ++){
                if(i > 0) newAllList.pop()
                const result = getRSI(Number(newAllList[newAllList.length-1][4]),newAllList.map(item=>Number(item[4])))
                columnsObjList.push(result)
                yield i
            }
        }

        for(let k of gen()){
            if( k >= 3 ) break
        }

        // allList.pop()
        // const result = getRSI(allList[allList.length-1],allList)
        // columnsObjList.push(result)

        columnsObjList = columnsObjList.reverse()
        const latestColumnsObjList = columnsObjList.slice(-3)
        // let goldOverlappingNum = 0
        // let deadOverlappingNum = 0
        // const goldList = []
        // const deadList = []
        // for(let i = 0; i < latestColumnsObjList.length - 2; i++){
        // const tripleList = latestColumnsObjList.slice(-6, -1)
        // const overlappingObj = isGoldOverLapping(tripleList, 0)
        // if(overlappingObj.isOverLapping) {
        //     goldOverlappingNum++;
        //     // goldList.push(overlappingObj)
        // }
        //
        // const deadOverlappingObj = isDeadOverLapping(tripleList, 0)
        // if(deadOverlappingObj.isOverLapping) {
        //     deadOverlappingNum++;
        //     // deadList.push(deadOverlappingObj)
        // }
        // }

        // let lowestRSI = {}
        // let highestRSI = {}
        // latestColumnsObjList.reduce((pre,cur,index)=>{
        //     if(index == 1){
        //         lowestRSI = { index: 0, RSI: pre };
        //         highestRSI = { index: 0, RSI: pre };
        //     }
        //     if(cur.RSI1 <= lowestRSI.RSI.RSI1){
        //         lowestRSI = { index, RSI: cur }
        //     }
        //     if(cur.RSI1 >= highestRSI.RSI.RSI1){
        //         highestRSI = { index, RSI: cur }
        //     }
        //     return cur;
        // })

        const latestRSI = latestColumnsObjList[latestColumnsObjList.length-1]

        if(positionChange || !globalHolding || !globalHolding.length){
            try{
                const { data: holding } = await cAuthClient.swap.getPosition(ETH_INSTRUMENT_ID, 'SWAP');
                globalHolding = holding
                positionChange = false
            }catch (e) {
                // if(result.error_message) throw new Error('Cannot get position!');
                restart('getPosition');
            }
        }

        let longHolding;
        let shortHolding
        let longRatio = 0
        let shortRatio = 0

        let holding = globalHolding
        if(holding && holding.length){
            longHolding = holding.find(item=>item.posSide=="long")
            shortHolding = holding.find(item=>item.posSide=="short")
        }

        if(longHolding){
            const { lever: leverage, avgPx: avg_cost, } = longHolding;
            longRatio = (Number(mark_price) - Number(avg_cost)) * Number(leverage) / Number(mark_price);
            lastLongMaxWinRatio = Math.max(longRatio,lastLongMaxWinRatio)
        }

        if(shortHolding){
            const { lever: leverage, avgPx: avg_cost, } = shortHolding;
            shortRatio = (Number(mark_price) - Number(avg_cost)) * Number(leverage) / Number(mark_price);
            shortRatio = - shortRatio
            lastShortMaxWinRatio = Math.max(shortRatio,lastShortMaxWinRatio)
        }

        // const bottomReverseCondition = !!(macdList[macdList.length-1].column >= macdList[macdList.length-2].column
        //     &&
        //     lowestMacd.index == macdList.length - 2
        //     &&
        //     (
        //         (lowestMacd.index != lowestDiff.index
        //             &&
        //             lowestDiff.index != macdList.length - 1
        //             &&
        //             lowestMacd.macd.diff > lowestDiff.macd.diff)
        //         ||
        //         lowestMacd.index != lowestRSI.index
        //     ))
        //
        // const topReverseCondition = !!(macdList[macdList.length-1].column <= macdList[macdList.length-2].column
        //     &&
        //     highestMacd.index == macdList.length - 2
        //     &&
        //     (
        //         (highestMacd.index != highestDiff.index
        //             &&
        //             highestDiff.index != macdList.length - 1
        //             &&
        //             highestMacd.macd.diff < highestDiff.macd.diff)
        //         ||
        //         highestMacd.index != highestRSI.index
        //     ))

        const openLongCondition = Number(macdList[macdList.length-1].column) > Number(macdList[macdList.length-2].column)
        &&
        (latestRSI.RSI1 < latestRSI.RSI3
            // || latestColumnsObjList[latestColumnsObjList.length-2].RSI1 < latestColumnsObjList[latestColumnsObjList.length-2].RSI3
        )
        // &&
        // lastLongMaxWinRatio != 0

        const openShortCondition = Number(macdList[macdList.length-1].column) < Number(macdList[macdList.length-2].column)
        &&
        (latestRSI.RSI1 > latestRSI.RSI3
            // || latestColumnsObjList[latestColumnsObjList.length-2].RSI1 > latestColumnsObjList[latestColumnsObjList.length-2].RSI3
        )
        // &&
        // lastShortMaxWinRatio != 0

        const closeLongCondition = (Number(macdList[macdList.length-1].column) < Number(macdList[macdList.length-2].column)
        &&
        latestRSI.RSI1 < latestRSI.RSI3)
        // ||
        // latestRSI.RSI1 > 75
        // ||
        // (lastLongMaxWinRatio > 0.07 && longRatio < 0.02)
        // ||
        // topReverseCondition

        const closeShortCondition = (Number(macdList[macdList.length-1].column) > Number(macdList[macdList.length-2].column)
        &&
        latestRSI.RSI1 > latestRSI.RSI3)
        // ||
        // latestRSI.RSI1 < 23
        // ||
        // (lastShortMaxWinRatio > 0.07 && shortRatio < 0.02)
        // ||
        // bottomReverseCondition

        console.log('************************************', moment().format('YYYY-MM-DD HH:mm:ss'))
        console.log('------------------')
        console.log('allList',allList.slice(-2))
        console.log('mark_price',mark_price)
        console.log('macdList',macdList.slice(-2))
        console.log('latestColumnsObjList',latestColumnsObjList.slice(-2))
        console.log('lastLongMaxWinRatio',lastLongMaxWinRatio,'longRatio',longRatio)
        console.log('lastShortMaxWinRatio',lastShortMaxWinRatio,'shortRatio',shortRatio)
        console.log('------------------')

        //开多仓条件
        if(
            openLongCondition
        ){
            try {
                if(
                    (!longHolding || !Number(longHolding.pos))
                    // && (!shortHolding || !Number(shortHolding.pos))
                ){
                    // console.log('******************open long moment******************', moment().format('YYYY-MM-DD HH:mm:ss'))
                    // console.log('------------------')
                    // console.log('macdList',macdList.slice(-2))
                    // console.log('------------------')

                    await autoOpenOtherOrderSingle({ openSide: "long", mark_price })
                }
            }catch (e){
                console.log(e)
            }
        }

        //平多仓条件
        if(
            closeLongCondition
        ){
            try {
                if(longHolding && Number(longHolding.pos)){
                    const payload = {
                        instrument_id: ETH_INSTRUMENT_ID,
                        position: Number(longHolding.pos),
                        side: 'long',
                        mark_price
                    }
                    await closeHalfPositionByMarket(payload)
                    lastLongMaxWinRatio = 0
                }
            }catch (e){
                console.log(e)
            }
        }

        //开空仓条件
        if(
            openShortCondition
        ){
            try {
                if(
                    // (!longHolding || !Number(longHolding.pos))
                    // &&
                    (!shortHolding || !Number(shortHolding.pos))
                ){
                    // console.log('******************open short moment******************', moment().format('YYYY-MM-DD HH:mm:ss'))
                    // console.log('------------------')
                    // console.log('macdList',macdList.slice(-2))
                    // console.log('------------------')

                    await autoOpenOtherOrderSingle({ openSide: "short", mark_price });
                }
            }catch (e){
                console.log(e)
            }
        }

        //平空仓条件
        if(
            closeShortCondition
        ){
            try {
                if(shortHolding && Number(shortHolding.pos)){
                    const payload = {
                        instrument_id: ETH_INSTRUMENT_ID,
                        position: Number(shortHolding.pos),
                        side: 'short',
                        mark_price
                    }
                    await closeHalfPositionByMarket(payload)
                    lastShortMaxWinRatio = 0
                }
            }catch (e){
                console.log(e)
            }
        }
    }

    await waitTime(1000 * 8)
    await startInterval()
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
    // await startInterval()
    try{
        const { data }= await cAuthClient.swap.getMarkPrice(ETH_INSTRUMENT_ID);
        const mark_price = Number(data[0].markPx);
        await autoOpenOtherOrderSingle({ openSide: "long", mark_price })
    }catch (e) {
        console.log(e)
    }
})()
app.listen(8091);

console.log('8091 server start');

process.on('uncaughtException', function (err) {
    //打印出错误
    // console.log('uncaughtException',err);
    restart()
});

let exec = require('child_process').exec;
function restart() {
    console.log('restarting......')
    setTimeout(()=>{
        exec('npm run restart', function(err, stdout , stderr ){
            if (err) {
                console.log('restarting failed')
            }else{
                console.log('restarting success')
            }
        });
    }, 1000 * 10)
}
