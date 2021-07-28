import request from '../utils/request';
import moment from 'moment'

// const {PublicClient} = require('@okfe/okex-node');
// const {AuthenticatedClient} = require('@okfe/okex-node');
// const customAuthClient = require('./customAuthClientV5');
const customAuthClientBN = require('./customAuthClientBN');

// const fs = require('fs');

//读取配置文件，变量config的类型是Object类型
// let dataConfig = require('./configETH.json');

// const OK_INSTRUMENT_ID = "ETH-USDT-SWAP";
const BN_SYMBOL = "ETHUSDT";
const INIT_POSITION = 1;
const LEVERAGE = 10;
let currentPosition = {};
let longPosition = {};
let shortPosition = {};
let longPatchNum = 0;
let shortPatchNum = 0;
let totalProfit = 0;
let dealDetailList = [];
const INIT_MOST_LOSS = {
    profit: 0,
    time: null,
}
let mostLoss = INIT_MOST_LOSS;
let maxWinRatio = 0;
let rsi1 = 6;
let rsi2 = 12;
let rsi3 = 24;

const LOSS_MAX = - 0.2;
const WIN_MAX = 0;

let myInterval;

// var config = require('./configV5');
var configBN = require('./configBN');
// const cAuthClient = new customAuthClient(
//     config.httpkey,
//     config.httpsecret,
//     config.passphrase,
//     config.urlHost
// )
const cAuthClientBN = new customAuthClientBN(
    configBN.httpkey,
    configBN.httpsecret,
    configBN.urlHost
)

var express = require('express');
var app = express();

app.all('*', function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'X-Requested-With');
    res.header("Access-Control-Allow-Headers","content-type");
    res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');
    res.header('X-Powered-By', ' 3.2.1');
    res.header('Content-Type', 'application/json;charset=utf-8');
    if (req.method.toLowerCase() == 'options')
        res.send(200);  //让options尝试请求快速结束
    else
        next();
});

function send(res, ret) {
    var str = JSON.stringify(ret);
    res.send(str);
}

function getCurrentMacd(list) {
    let macdList = []
    list.map((item,index)=>{
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
                low: Number(item[3]),
                time: moment(parseInt(item[0])).format('YYYY-MM-DD HH:mm:ss')
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
                time: moment(parseInt(item[0])).format('YYYY-MM-DD HH:mm:ss')
            }
            result = getMacd(payload)
        }

        macdList.push(result)
    })

    macdList = macdList.slice(-1400)
    return macdList
}

function getCurrentRSI(list) {
    const newList = JSON.parse(JSON.stringify(list))
    let rsiList = []
    function* gen() {
        for(let i = 0; i < Math.min(newList.length, 1400); i ++){
            if(i > 0) list.pop()
            const result = getRSI(Number(list[list.length-1][0]),Number(list[list.length-1][4]),list.map(item=>Number(item[4])))
            rsiList.push(result)
            yield i
        }
    }

    for(let k of gen()){
        if( k >= Math.min(newList.length, 1400) ) break
    }

    rsiList = rsiList.reverse()
    // rsiList = rsiList.slice(-2)
    return rsiList
}

app.get('/test', function(req, res) {
    send(res, {errcode: 0, errmsg: 'ok'});
});

function getMacd(params) {
    const {price,lastEma12,lastEma26,lastDea,high,low,time} = params

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
        low,
        time
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
    }else if(i==1||i==2){
        gainAverageI = 100;
        lossAverageI = 100;
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
    const RS = gainAverageI / (lossAverageI || 1);
    const RSI = 100 - 100 / (1 + RS);
    const newResult = {
        RSI: toFixedAndToNumber(RSI,2),
        gainAverageI,
        lossAverageI
    }
    return newResult;
}
function getRSI(time,price,list){
    const { RSI: RSI1 } = getRSIByPeriod(list,rsi1)
    const { RSI: RSI2 } = getRSIByPeriod(list,rsi2)
    const { RSI: RSI3 } = getRSIByPeriod(list,rsi3)

    const result = {
        time: moment(parseInt(time)).format("YYYY-MM-DD HH:mm:ss"),
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

app.get('/swap/reset', async (req, response) => {
    totalProfit = 0;
    currentPosition = {};
    longPosition = {};
    shortPosition = {};
    dealDetailList = []
    mostLoss = {}
    send(response, {errcode: 0, errmsg: 'ok', data: { totalProfit, currentPosition, dealDetailList } });
});

app.get('/swap/setRSIParams', async (req, response) => {
    const {query = {}} = req;
    const { rsi1: rsiP1, rsi2: rsiP2, rsi3: rsiP3 } = query;
    rsi1 = rsiP1;
    rsi2 = rsiP2;
    rsi3 = rsiP3;
    send(response, {errcode: 0, errmsg: 'ok', data: { rsi1, rsi2, rsi3 } });
});

app.get('/swap/getHistory', async (req, response) => {
    const {query = {}} = req;
    const { time } = query;
    const payload = {
        interval: '3m',
        limit: 480,
        startTime: time
    }
    const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload)
    // const list = data.reverse();
    const list = data;
    send(response, {errcode: 0, errmsg: 'ok', data: list });
});

app.get('/swap/startHearBeat', async (req, response) => {
    const {query = {}} = req;
    const { time, date, interval = '3m', limit = 1500, isAutoReset = true } = query;
    try{
        dealDetailList = [];
        mostLoss = INIT_MOST_LOSS;

        if(isAutoReset){
            totalProfit = 0;
            maxWinRatio = 0;
            currentPosition = {};
            longPosition = {};
            shortPosition = {};
        }

        // const mock = require(`./mock/${date}.js`);
        // const list = mock.mockData

        const payload = {
            interval,
            limit,
            startTime: time
        }
        const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload)
        const list = data;

        const newList = JSON.parse(JSON.stringify(list))
        const macdList = getCurrentMacd(newList)
        const rsiList = getCurrentRSI(newList)

        const result = {
            macdList,
            rsiList
        }
        await checkDeal(result,isAutoReset);
        send(response, {errcode: 0, errmsg: 'ok', data: {
            // history: list,
            // index: result,
            totalProfit,
            currentPosition,
            dealDetailList,
            mostLoss,
            } });
    }catch (e) {
        console.log(e)
        restart('startHearBeat')
    }
});

app.get('/swap/getLatestProfit', async (req, response) => {
    const {query = {}} = req;
    const { time, interval = '3m', limit = 1440 } = query;
    try{
        const payload = {
            interval,
            limit,
            endTime: time
        }
        const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload)
        const list = data;
        totalProfit = 0;
        currentPosition = {};
        longPosition = {};
        shortPosition = {};
        dealDetailList = [];
        mostLoss = INIT_MOST_LOSS;
        maxWinRatio = 0;

        const newList = JSON.parse(JSON.stringify(list))
        const macdList = getCurrentMacd(newList).slice(-1400)
        const rsiList = getCurrentRSI(newList).slice(-1400)

        const result = {
            macdList,
            rsiList
        }
        await checkDeal(result);
        send(response, {errcode: 0, errmsg: 'ok', data: {
            // index: result,
            totalProfit, dealDetailList, mostLoss } });
    }catch (e) {
        console.log(e)
        restart()
    }
});

const checkDeal = async (data,isAutoReset = true) => {
    for(let i = 0; i < data.macdList.length - 4; i++){
        checkByStep({
            macdList: data.macdList.slice(i,i+5),
            rsiList: data.rsiList.slice(i,i+5),
        },isAutoReset && i == data.macdList.length - 5)
    }

    function checkByStep(data,isForceDeal){
        const { macdList, rsiList } = data;
        const mark_price = macdList[macdList.length-1].price;

        let longHolding;
        let shortHolding
        let longRatio = 0
        let shortRatio = 0

        // if(currentPosition.positionSide == 'LONG' && currentPosition.positionAmt) longHolding = currentPosition;
        // if(currentPosition.positionSide == 'SHORT' && currentPosition.positionAmt) shortHolding = currentPosition;

        if(longPosition && longPosition.positionAmt) longHolding =  longPosition;
        if(shortPosition && shortPosition.positionAmt) shortHolding =  shortPosition;

        if(longHolding){
            const { leverage, entryPrice: avg_cost, } = longHolding;
            longRatio = (Number(mark_price) - Number(avg_cost)) * Number(leverage) / Number(mark_price);
            maxWinRatio = Math.max(maxWinRatio,longRatio)
        }

        if(shortHolding){
            const { leverage, entryPrice: avg_cost, } = shortHolding;
            shortRatio = (Number(mark_price) - Number(avg_cost)) * Number(leverage) / Number(mark_price);
            shortRatio = - shortRatio
            maxWinRatio = Math.max(maxWinRatio,shortRatio)
        }

        const ifMacdLongContinuity = macdList.every((item,index,arr)=>{
            if(index==0) return true;
            return arr[index].column < arr[index - 1].column
        });
        const ifMacdShortContinuity = macdList.every((item,index,arr)=>{
            if(index==0) return true;
            return arr[index].column > arr[index - 1].column
        });

        let ifMacdLongGreaterContinuity = true;
        let ifMacdShortLessContinuity = true;

        macdList.reduce((pre,cur,index)=>{
            if(pre.column < 0) ifMacdLongGreaterContinuity = false;
            if(pre.column > 0) ifMacdShortLessContinuity = false;
            return cur;
        })

        const getMinIndex = (arr,key) => {
            let i = 0;
            arr.reduce((pre,cur,index)=>{
                if(cur[key] < pre[key]) i = index;
                return cur;
            })
            return i;
        }

        const getMaxIndex = (arr,key) => {
            let i = 0;
            arr.reduce((pre,cur,index)=>{
                if(cur[key] > pre[key]) i = index;
                return cur;
            })
            return i;
        }

        const minPriceIndex = getMinIndex(macdList,'low');
        const minMacdIndex = getMinIndex(macdList,'column');

        const maxPriceIndex = getMaxIndex(macdList,'high');
        const maxMacdIndex = getMaxIndex(macdList,'column');

        const MAIN_OPEN_LONG_CONDITION = (Number(macdList[macdList.length-1].column) > 0
                && rsiList[rsiList.length-1].RSI1 < rsiList[rsiList.length-1].RSI3
                && rsiList[rsiList.length-2].RSI1 > rsiList[rsiList.length-2].RSI3
                && rsiList[rsiList.length-1].RSI3 > 50
            )

        const MAIN_OPEN_SHORT_CONDITION = (Number(macdList[macdList.length-1].column) < 0
                && rsiList[rsiList.length-1].RSI1 > rsiList[rsiList.length-1].RSI3
                && rsiList[rsiList.length-2].RSI1 < rsiList[rsiList.length-2].RSI3
                && rsiList[rsiList.length-1].RSI3 < 48
            )

        const openLongCondition = MAIN_OPEN_LONG_CONDITION

        const openShortCondition = MAIN_OPEN_SHORT_CONDITION

        const closeLongCondition =
            MAIN_OPEN_SHORT_CONDITION
            || isForceDeal
            // || rsiList[rsiList.length-1].RSI3 > 80
            // || rsiList[rsiList.length-1].RSI1 > 90
            // || longRatio < LOSS_MAX
            // || (longRatio < WIN_MAX && maxWinRatio > WIN_MAX)

        const closeShortCondition =
            MAIN_OPEN_LONG_CONDITION
            || isForceDeal
            // || rsiList[rsiList.length-1].RSI3 < 20
            // || rsiList[rsiList.length-1].RSI1 < 10
            // || shortRatio < LOSS_MAX
            // || (shortRatio < WIN_MAX && maxWinRatio > WIN_MAX)

        // console.log('************************************', moment().format('YYYY-MM-DD HH:mm:ss'))
        // console.log('------------------')
        // console.log('mark_price',mark_price)
        // console.log('macdList',macdList.slice(-2))
        // console.log('latestColumnsObjList',rsiList.slice(-2))
        // console.log('------------------')

        const patchPosition = async (holding,direction) => {
            const price = (Number(mark_price) + Number(holding.entryPrice)) / 2
            if(direction == 'LONG'){
                longPosition = {
                    positionSide: direction,
                    leverage: LEVERAGE,
                    entryPrice: price,
                    positionAmt: INIT_POSITION * 2,
                    time: macdList[macdList.length-1].time,
                }
            }else{
                shortPosition = {
                    positionSide: direction,
                    leverage: LEVERAGE,
                    entryPrice: price,
                    positionAmt: INIT_POSITION * 2,
                    time: macdList[macdList.length-1].time,
                }
            }
            const dealDetail = {
                side: 'OPEN',
                positionSide: direction,
                leverage: LEVERAGE,
                entryPrice: price,
                positionAmt: INIT_POSITION * 2,
                time: macdList[macdList.length-1].time,
                macdList,
                rsiList,
            }
            totalProfit += - 0.038 * 0.01 * LEVERAGE
            dealDetailList.push(dealDetail)
            if(direction == 'LONG'){
                longPatchNum += 1;
            }else{
                shortPatchNum += 1;
            }
        }

        const closeLong = async () => {
            if(longHolding && Number(longHolding.positionAmt)){
                if(!longPatchNum && longRatio < LOSS_MAX && !isForceDeal && false) {
                    await patchPosition(longHolding, 'LONG')
                    longPatchNum += 1;
                }else{
                    totalProfit += longRatio * longHolding.positionAmt;
                    totalProfit += - 0.038 * 0.01 * LEVERAGE * longHolding.positionAmt
                    const dealDetail = {
                        side: 'CLOSE',
                        positionSide: 'LONG',
                        entryPrice: mark_price,
                        positionAmt: longHolding.positionAmt,
                        time: macdList[macdList.length-1].time,
                        totalProfit,
                        currentProfit: longRatio * longHolding.positionAmt,
                        macd: macdList[macdList.length-1],
                        rsi: rsiList[rsiList.length-1]
                    }
                    dealDetailList.push(dealDetail)
                    if(longRatio < mostLoss.profit){
                        mostLoss = {
                            profit: longRatio * longHolding.positionAmt,
                            time: macdList[macdList.length-1].time,
                        }
                    }
                    longHolding = {}
                    // currentPosition = {}
                    longPosition = {}
                    maxWinRatio = 0;
                    longPatchNum = 0;
                }
            }
        }

        const closeShort = async () => {
            if(shortHolding && Number(shortHolding.positionAmt)){
                if(!shortPatchNum && shortRatio < LOSS_MAX && !isForceDeal && false){
                    await patchPosition(shortHolding,'SHORT')
                    shortPatchNum += 1;
                }else{
                    totalProfit += shortRatio * shortHolding.positionAmt
                    totalProfit += - 0.038 * 0.01 * LEVERAGE * shortHolding.positionAmt
                    const dealDetail = {
                        side: 'CLOSE',
                        positionSide: 'SHORT',
                        entryPrice: mark_price,
                        positionAmt: shortHolding.positionAmt,
                        time: macdList[macdList.length-1].time,
                        totalProfit,
                        currentProfit: shortRatio * shortHolding.positionAmt,
                        macd: macdList[macdList.length-1],
                        rsi: rsiList[rsiList.length-1]
                    }
                    dealDetailList.push(dealDetail)
                    if(shortRatio < mostLoss.profit){
                        mostLoss = {
                            profit: shortRatio * shortHolding.positionAmt,
                            time: macdList[macdList.length-1].time,
                        }
                    }
                    shortHolding = {}
                    // currentPosition = {}
                    shortPosition = {}
                    maxWinRatio = 0;
                    shortPatchNum = 0;
                }
            }
        }

        //平多仓条件
        if(
            closeLongCondition
        ){
            try {
                closeLong()
            }catch (e){
                console.log(e)
            }
        }

        //平空仓条件
        if(
            closeShortCondition
        ){
            try {
                closeShort()
            }catch (e){
                console.log(e)
            }
        }

        //开多仓条件
        if(
            openLongCondition
        ){
            try {
                if(
                    (!longHolding || !Number(longHolding.positionAmt))
                    // && (!shortHolding || !Number(shortHolding.positionAmt))
                ){
                    // closeShort()
                    longPosition = {
                        positionSide: 'LONG',
                        leverage: LEVERAGE,
                        entryPrice: mark_price,
                        positionAmt: INIT_POSITION,
                        time: macdList[macdList.length-1].time,
                    }
                    const dealDetail = {
                        side: 'OPEN',
                        positionSide: 'LONG',
                        leverage: LEVERAGE,
                        entryPrice: mark_price,
                        positionAmt: INIT_POSITION,
                        time: macdList[macdList.length-1].time,
                        macdList,
                        rsiList,
                    }
                    totalProfit += - 0.038 * 0.01 * LEVERAGE
                    dealDetailList.push(dealDetail)
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
                    // (!longHolding || !Number(longHolding.positionAmt))
                    // &&
                    (!shortHolding || !Number(shortHolding.positionAmt))
                ){
                    // closeLong()
                    shortPosition = {
                        positionSide: 'SHORT',
                        leverage: LEVERAGE,
                        entryPrice: mark_price,
                        positionAmt: INIT_POSITION,
                        time: macdList[macdList.length-1].time,
                    }
                    const dealDetail = {
                        side: 'OPEN',
                        positionSide: 'SHORT',
                        leverage: LEVERAGE,
                        entryPrice: mark_price,
                        positionAmt: INIT_POSITION,
                        time: macdList[macdList.length-1].time,
                        macdList,
                        rsiList,
                    }
                    totalProfit += - 0.038 * 0.01 * LEVERAGE
                    dealDetailList.push(dealDetail)
                }
            }catch (e){
                console.log(e)
            }
        }

    }
}

// 定时获取交割合约账户信息
(async ()=>{
    // await startInterval()
})()
app.listen(8092);

console.log('8092 server start');

process.on('uncaughtException', function (err) {
    //打印出错误
    // console.log('uncaughtException',err);
    restart()
});

let exec = require('child_process').exec;
function restart(resource) {
    console.log('restarting......',resource)
    setTimeout(()=>{
        exec('npm run restart:product', function(err, stdout , stderr ){
            if (err) {
                console.log('restarting failed')
            }else{
                console.log('restarting success')
            }
        });
    }, 1000 * 10)
}
