import request from '../utils/request';
import moment from 'moment'

// const {PublicClient} = require('@okfe/okex-node');
const {AuthenticatedClient} = require('@okfe/okex-node');
const customAuthClient = require('./customAuthClientV5');
const customAuthClientBN = require('./customAuthClientBN');

const fs = require('fs');

//读取配置文件，变量config的类型是Object类型
// let dataConfig = require('./configETH.json');

const OK_INSTRUMENT_ID = "ETH-USDT-SWAP";
const BN_SYMBOL = "ETHUSDT";
const INIT_POSITION = 0.2;

let myInterval;

var config = require('./configV5');
var configBN = require('./configBN');
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
var app = express();

function send(res, ret) {
    var str = JSON.stringify(ret);
    res.send(str);
}

let lastLongMaxWinRatio = 0
let lastShortMaxWinRatio = 0
const startInterval = async () => {
    const payload = {
        bar: '5m',
        // limit: 100,
    }

    try{
        const { data } = await cAuthClient.swap.getHistory(OK_INSTRUMENT_ID, payload)
        globalColumnsObjList = data.reverse()
        // globalColumnsObjList = data
    }catch (e) {
        // if(!Array.isArray(data)) throw new Error('Data is not array!');
        restart()
    }

    if(Array.isArray(globalColumnsObjList)){
        let mark_price;
        try{
            const { data }= await cAuthClient.swap.getMarkPrice(OK_INSTRUMENT_ID);
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
                const { positions: holding } = await cAuthClientBN.swap.getPosition();
                globalHolding = holding.filter(item=>item.positionAmt && Math.abs(Number(item.positionAmt)) > 0) || []
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
            longHolding = holding.find(item=>item.positionSide=="LONG")
            shortHolding = holding.find(item=>item.positionSide=="SHORT")
        }

        if(longHolding){
            const { leverage, entryPrice: avg_cost, } = longHolding;
            longRatio = (Number(mark_price) - Number(avg_cost)) * Number(leverage) / Number(mark_price);
            lastLongMaxWinRatio = Math.max(longRatio,lastLongMaxWinRatio)
        }

        if(shortHolding){
            const { leverage, entryPrice: avg_cost, } = shortHolding;
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
            Number(macdList[macdList.length-1].column) > 0
            &&
            Number(macdList[macdList.length-2].column) < 0
            &&
            latestRSI.RSI1 > latestRSI.RSI3
            &&
            latestRSI.RSI1 > 50
            &&
            latestColumnsObjList[latestColumnsObjList.length-2].RSI1 < 60
            // (latestRSI.RSI1 < latestRSI.RSI3
            //     || latestColumnsObjList[latestColumnsObjList.length-2].RSI1 < latestColumnsObjList[latestColumnsObjList.length-2].RSI3
            // )
        // &&
        // lastLongMaxWinRatio != 0

        const openShortCondition = Number(macdList[macdList.length-1].column) < Number(macdList[macdList.length-2].column)
            &&
            Number(macdList[macdList.length-1].column) < 0
            &&
            Number(macdList[macdList.length-2].column) > 0
            &&
            latestRSI.RSI1 < latestRSI.RSI3
            &&
            latestRSI.RSI1 < 50
            &&
            latestColumnsObjList[latestColumnsObjList.length-2].RSI1 > 40
            // (latestRSI.RSI1 > latestRSI.RSI3
            //     || latestColumnsObjList[latestColumnsObjList.length-2].RSI1 > latestColumnsObjList[latestColumnsObjList.length-2].RSI3
            // )
        // &&
        // lastShortMaxWinRatio != 0

        const closeLongCondition = Number(macdList[macdList.length-1].column) < 0
            &&
            latestRSI.RSI1 < 50
        // ||
        // latestRSI.RSI1 > 75
        // ||
        // (lastLongMaxWinRatio > 0.07 && longRatio < 0.02)
        // ||
        // topReverseCondition

        const closeShortCondition = Number(macdList[macdList.length-1].column) > 0
            &&
            latestRSI.RSI1 > 50
        // ||
        // latestRSI.RSI1 < 23
        // ||
        // (lastShortMaxWinRatio > 0.07 && shortRatio < 0.02)
        // ||
        // bottomReverseCondition

        console.log('************************************', moment().format('YYYY-MM-DD HH:mm:ss'))
        console.log('------------------')
        console.log('mark_price',mark_price)
        console.log('macdList',macdList.slice(-2))
        console.log('latestColumnsObjList',latestColumnsObjList.slice(-2))
        console.log('------------------')

        //开多仓条件
        if(
            openLongCondition
        ){
            try {
                if(
                    (!longHolding || !Number(longHolding.positionAmt))
                    && (!shortHolding || !Number(shortHolding.positionAmt))
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
                if(longHolding && Number(longHolding.positionAmt)){
                    const payload = {
                        position: Number(longHolding.positionAmt),
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
                    (!longHolding || !Number(longHolding.positionAmt))
                    &&
                    (!shortHolding || !Number(shortHolding.positionAmt))
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
                if(shortHolding && Number(shortHolding.positionAmt)){
                    const payload = {
                        position: Number(shortHolding.positionAmt),
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

let cancelInterval;
const autoOpenOtherOrderSingle = async (params = {}) => {
    const { openSide = 'long', position = Number(INIT_POSITION), mark_price } = params;

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
            quantity: Math.abs(size),
            recvWindow: 5000,
            // timeInForce: 'GTC',
            // timestamp: moment(new Date()).valueOf(),
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
const closeHalfPositionByMarket = async (holding) => {
    const { position = INIT_POSITION, side, mark_price } = holding;
    async function postOrder(size,price) {
        const type = side == 'long' ? 'SELL' : 'BUY'
        const payload = {
            symbol: BN_SYMBOL,
            side: type,
            positionSide: side == 'long' ? 'LONG' : 'SHORT',
            type: 'MARKET',
            quantity: Math.abs(size),
            recvWindow: 5000,
            // timestamp: moment(new Date()).valueOf(),
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
    const { RSI: RSI1 } = getRSIByPeriod(list,5)
    const { RSI: RSI2 } = getRSIByPeriod(list,15)
    const { RSI: RSI3 } = getRSIByPeriod(list,30)

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
    // try{
    //     const { data }= await cAuthClient.swap.getMarkPrice(OK_INSTRUMENT_ID);
    //     const mark_price = Number(data[0].markPx);
    //     await autoOpenOtherOrderSingle({ openSide: "long", mark_price })
    //     // await closeHalfPositionByMarket({ side: "long" })
    // }catch (e) {
    //     console.log(e)
    // }
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
