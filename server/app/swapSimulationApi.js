import request from '../utils/request';
import moment from 'moment';

// const {PublicClient} = require('@okfe/okex-node');
// const {AuthenticatedClient} = require('@okfe/okex-node');
// const customAuthClient = require('./customAuthClientV5');
const customAuthClientBN = require('./customAuthClientBN');
const querystring = require('querystring');
const fs = require('fs');

//读取配置文件，变量config的类型是Object类型
// let dataConfig = require('./configETH.json');

const generatePositionList = (init, num) => {
	const arr = [init];
	let i = 0;
	while (i < num) {
		init = Number((init + init * 0.15).toFixed(3));
		arr.push(init);
		i++;
	}
	return arr;
};

function getRandomNumberByRange(start, end) {
	return Math.floor(Math.random() * (end - start) + start);
}

// const OK_INSTRUMENT_ID = "ETH-USDT-SWAP";
const BN_SYMBOL = 'ETHUSDT';
const LEVERAGE = 10;
const INTERVAL = '1h';
const BAO_RATIO = (-0.8 * LEVERAGE) / 10;
const LOSS_MAX = (-1 * LEVERAGE) / 10;
const WIN_MAX = ((0.1 / 2) * LEVERAGE) / 10;
// const BAO_RATIO = LOSS_MAX * 2;
const CAPITAL_RATIO = 1;
const ORIGIN_INIT_POSITION = 1;
const DEFAULT_POSITION_RATIO_LIST = generatePositionList(
	ORIGIN_INIT_POSITION,
	0
);
// const DEFAULT_POSITION_RATIO_LIST = [2];
const MODE_RATIO = {
	1: DEFAULT_POSITION_RATIO_LIST,
	2: DEFAULT_POSITION_RATIO_LIST,
};
const DEFAULT_MODE = 1;
let MODE = DEFAULT_MODE;
let MODE2_NUM = 0;

const INCREASE_FI_LIST = generatePositionList(INIT_POSITION, 20).map((item) =>
	Number((item * CAPITAL_RATIO).toFixed(2))
);
let INIT_POSITION = 3;
const MAX_OPEN_POSITION_RATIO = INIT_POSITION * 3;
let NEW_POSITION_RATIO = 1;
let IS_CLOSE_ALL_POSITION = false;
const CLOSE_SAME_POSITION_RATIO = 6;

let continuous_win = 0;
let continuous_loss = 0;
let lastWinOrLoss = 0; // 0: loss, 1: win
let lastPosition = INIT_POSITION;
let maxContinuousWin = 0;
let maxContinuousLoss = 0;
let baoNumTotal = 0;

let modeChange = false;

const INIT_MOST_LOSS = {
	profit: 0,
	time: null,
};
const POSITION_RATIO_DEFAULT = 100;
let POSITION_RATIO = POSITION_RATIO_DEFAULT;
const ORIGIN_TOTAL_CAPITAL = (INIT_POSITION / LEVERAGE) * POSITION_RATIO;
let totalCapital = ORIGIN_TOTAL_CAPITAL;
let totalPosition = 0;
let receiveCapital = 0;
let minTotalCapital = totalCapital;
let maxOpenPosition = 0;
let ifIgnore = false;
let ignoreNum = 0;

let currentPosition = {};
let longPosition = {
	entryPrice: 0,
	positionAmt: 0,
};
let shortPosition = {
	entryPrice: 0,
	positionAmt: 0,
};
let longPatchNum = 0;
let shortPatchNum = 0;
let totalProfit = 0;
let currentMarketPrice = 0;
let dealDetailList = [];
let mostLoss = INIT_MOST_LOSS;
let maxWinRatio = 0;
let rsi1 = 5;
let rsi2 = 14;
let rsi3 = 24;

const DEFAULT_CONDITION = 50;
let LONG_CONDITION = DEFAULT_CONDITION;
let SHORT_CONDITION = DEFAULT_CONDITION;

let lastMode = 0;

// const REVERSE_RATIO = - 0.15 * LEVERAGE / 10;

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
);

var express = require('express');
var app = express();

app.all('*', function (req, res, next) {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Headers', 'X-Requested-With');
	res.header('Access-Control-Allow-Headers', 'content-type');
	res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS');
	res.header('X-Powered-By', ' 3.2.1');
	res.header('Content-Type', 'application/json;charset=utf-8');
	if (req.method.toLowerCase() == 'options') res.send(200);
	//让options尝试请求快速结束
	else next();
});

function send(res, ret) {
	var str = JSON.stringify(ret);
	res.send(str);
}

function getCurrentMacd(list, last) {
	let macdList = [];
	list.map((item, index) => {
		let result = {};
		if (index == 0) {
			result = last || {
				ema12: Number(item[4]),
				ema26: Number(item[4]),
				diff: 0,
				dea: 0,
				column: 0,
				open: Number(item[1]),
				high: Number(item[2]),
				low: Number(item[3]),
				close: Number(item[4]),
				quantity: Number(item[5]),
				time: moment(parseInt(item[0])).format('YYYY-MM-DD HH:mm:ss'),
				week: moment(parseInt(item[0])).day(),
			};
		} else {
			const lastResult = macdList[macdList.length - 1];
			const payload = {
				lastEma12: lastResult.ema12,
				lastEma26: lastResult.ema26,
				lastDea: lastResult.dea,
				open: Number(item[1]),
				high: Number(item[2]),
				low: Number(item[3]),
				close: Number(item[4]),
				quantity: Number(item[5]),
				time: moment(parseInt(item[0])).format('YYYY-MM-DD HH:mm:ss'),
				week: moment(parseInt(item[0])).day(),
			};
			result = getMacd(payload);
		}

		macdList.push(result);
	});

	macdList = macdList.slice(-1400);
	return macdList;
}

function getCurrentRSI(list, last) {
	const newList = JSON.parse(JSON.stringify(list));
	let rsiList = [];
	function* gen() {
		for (let i = 0; i < Math.min(newList.length, 1400); i++) {
			if (i > 0) list.pop();
			const result = getRSI(
				Number(list[list.length - 1][0]),
				Number(list[list.length - 1][4]),
				list.map((item) => Number(item[4])),
				last
			);
			rsiList.push(result);
			yield i;
		}
	}

	for (let k of gen()) {
		if (k >= Math.min(newList.length, 1400)) break;
	}

	rsiList = rsiList.reverse();
	return rsiList;
}

/**
 * 
 * （1）计算MA
MA=N日内的收盘价之和÷N
（2）计算标准差MD
MD=平方根（N-1）日的（C－MA）的两次方之和除以N
（C指收盘价）
（3）计算MB、UP、DN线
MB=（N－1）日的MA
UP=MB+k×MD
DN=MB－k×MD
（K为参数，可根据股票的特性来做相应的调整，一般默认为2）
 */
function getBOLL(list) {
	const N = 20;
	const k = 2;

	const newList = list.slice(-N);

	const MA =
		newList.reduce((pre, cur, index) => {
			if (index === 0) return pre;
			return Number(pre) + Number(cur[4]);
		}, Number(newList[0][4])) / N;
	const MD = Math.sqrt(
		newList.reduce((pre, cur, index) => {
			if (index === 0) return pre;
			return pre + Math.pow(Number(cur[4]) - MA, 2);
		}, Math.pow(Number(newList[0][4]) - MA, 2)) / N
	);

	const UP = MA + k * MD;
	const DN = MA - k * MD;

	return {
		MA,
		UP,
		DN,
		time: moment(parseInt(newList[newList.length - 1][0])).format(
			'YYYY-MM-DD HH:mm:ss'
		),
	};
}

function getCurrentBOLL(list) {
	const newList = JSON.parse(JSON.stringify(list));
	const result = [];

	for (let i = newList.length; i >= 1; i -= 1) {
		let currentBOLL = {};
		if (i >= 20) {
			currentBOLL = getBOLL(newList.slice(i - 20, i));
		}
		result.push(currentBOLL);
	}
	result.reverse();
	return result;
}

app.get('/test', function (req, res) {
	send(res, { errcode: 0, errmsg: 'ok' });
});

function getMacd(params) {
	const {
		close: price,
		lastEma12,
		lastEma26,
		lastDea,
		high,
		low,
		time,
		week,
		quantity,
		open,
	} = params;

	const ema12 = toFixedAndToNumber(
		(2 / (12 + 1)) * price + (11 / (12 + 1)) * lastEma12,
		4
	);
	const ema26 = toFixedAndToNumber(
		(2 / (26 + 1)) * price + (25 / (26 + 1)) * lastEma26,
		4
	);

	const diff = toFixedAndToNumber(ema12 - ema26, 2);
	const dea = toFixedAndToNumber(
		(2 / (9 + 1)) * diff + (8 / (9 + 1)) * lastDea,
		2
	);

	const column = toFixedAndToNumber(2 * (diff - dea), 2);

	const result = {
		open,
		close: price,
		ema12,
		ema26,
		diff,
		dea,
		column,
		high,
		low,
		quantity,
		time,
		week,
	};

	return result;
}
function toFixedAndToNumber(n, num = 1) {
	// return Number(n.toFixed(num))
	return Math.round(n * Math.pow(10, num)) / Math.pow(10, num);
}
function getRSIAverage(list, i, n, last) {
	let diff;
	let gainI = 0;
	let lossI = 0;
	if (i == 0) {
		if (last) {
			diff = Number(list[i]) - last.price;
			if (diff > 0) {
				gainI = Math.max(0, diff);
			} else {
				lossI = Math.max(0, -diff);
			}
		} else {
			diff = 0;
		}
	} else {
		diff = Number(list[i]) - Number(list[i - 1]);
		if (diff > 0) {
			gainI = Math.max(0, diff);
		} else {
			lossI = Math.max(0, -diff);
		}
	}

	let gainAverageI;
	let lossAverageI;

	if (i == 0) {
		gainAverageI = gainI;
		lossAverageI = lossI;
	} else if ((i == 1 || i == 2) && !last) {
		gainAverageI = 100;
		lossAverageI = 100;
	} else {
		const lastRSIAverage = getRSIAverage(list, i - 1, n);
		gainAverageI = (gainI + (n - 1) * lastRSIAverage.gainAverageI) / n;
		lossAverageI = (lossI + (n - 1) * lastRSIAverage.lossAverageI) / n;
	}

	// console.log('gain','loss',gainAverageI,lossAverageI)
	return {
		gainAverageI,
		lossAverageI,
	};
}
function getRSIByPeriod(newList, period, last) {
	const result = getRSIAverage(newList, newList.length - 1, period, last);
	const { gainAverageI, lossAverageI } = result;
	// const RSI = gainAverageI / (gainAverageI + lossAverageI) * 100
	const RS = gainAverageI / (lossAverageI || 1);
	const RSI = 100 - 100 / (1 + RS);
	const newResult = {
		RSI: toFixedAndToNumber(RSI, 2),
		gainAverageI,
		lossAverageI,
	};
	return newResult;
}
function getRSI(time, price, list, last) {
	const { RSI: RSI1 } = getRSIByPeriod(list, rsi1, last);
	const { RSI: RSI2 } = getRSIByPeriod(list, rsi2, last);
	const { RSI: RSI3 } = getRSIByPeriod(list, rsi3, last);

	const result = {
		time: moment(parseInt(time)).format('YYYY-MM-DD HH:mm:ss'),
		week: moment(parseInt(time)).day(),
		price,
		RSI1,
		RSI2,
		RSI3,
	};
	return result;
}
//计算向量叉乘
function crossMul(v1, v2) {
	return v1.x * v2.y - v1.y * v2.x;
}
//判断两条线段是否相交
function checkCross(p1, p2, p3, p4) {
	let v1 = { x: p1.x - p3.x, y: p1.y - p3.y },
		v2 = { x: p2.x - p3.x, y: p2.y - p3.y },
		v3 = { x: p4.x - p3.x, y: p4.y - p3.y },
		v = crossMul(v1, v3) * crossMul(v2, v3);
	v1 = { x: p3.x - p1.x, y: p3.y - p1.y };
	v2 = { x: p4.x - p1.x, y: p4.y - p1.y };
	v3 = { x: p2.x - p1.x, y: p2.y - p1.y };
	return v <= 0 && crossMul(v1, v3) * crossMul(v2, v3) <= 0 ? true : false;
}
function isTripleDown(list) {
	return list.every((item) => item.RSI1 < item.RSI2);
}
function isTripleUp(list) {
	return list.every((item) => item.RSI1 > item.RSI2);
}
function isGoldOverLapping(list, index) {
	// let isOverLapping = false
	const isOverLapping = list.every(
		(item) => /* item.RSI1 >= item.RSI2 && */ item.RSI2 >= item.RSI3
	);
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
	};
	return overlappingObj;
}
function isDeadOverLapping(list, index) {
	// let isOverLapping = false
	const isOverLapping = list.every(
		(item) => /* item.RSI1 <= item.RSI2 && */ item.RSI2 <= item.RSI3
	);
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
		overlappingObj: list[0],
	};
	return overlappingObj;
}
function getAverage(list) {
	let sum = 0;
	for (let i = 0; i < list.length; i++) {
		sum += list[i];
	}
	let mean = sum / list.length;
	return mean;
}

function stopInterval() {
	if (myInterval) {
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
	longPosition = { entryPrice: 0, positionAmt: 0 };
	shortPosition = { entryPrice: 0, positionAmt: 0 };
	dealDetailList = [];
	mostLoss = {};
	send(response, {
		errcode: 0,
		errmsg: 'ok',
		data: { totalProfit, currentPosition, dealDetailList },
	});
});

app.get('/swap/setRSIParams', async (req, response) => {
	const { query = {} } = req;
	const { rsi1: rsiP1, rsi2: rsiP2, rsi3: rsiP3 } = query;
	rsi1 = rsiP1;
	rsi2 = rsiP2;
	rsi3 = rsiP3;
	send(response, { errcode: 0, errmsg: 'ok', data: { rsi1, rsi2, rsi3 } });
});

app.get('/swap/setConditionParams', async (req, response) => {
	const { query = {} } = req;
	const { longCondition: longConditionP, shortCondition: shortConditionP } =
		query;
	LONG_CONDITION = longConditionP;
	SHORT_CONDITION = shortConditionP;
	send(response, {
		errcode: 0,
		errmsg: 'ok',
		data: { LONG_CONDITION, SHORT_CONDITION },
	});
});

app.get('/swap/getHistory', async (req, response) => {
	const { query = {} } = req;
	const { time } = query;
	const payload = {
		interval: INTERVAL,
		limit: 480,
		startTime: time,
	};
	const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
	// const list = data.reverse();
	const list = data;
	send(response, { errcode: 0, errmsg: 'ok', data: list });
});

let lastMacd;
let lastRSI;
let lastHistoryList = [];
app.get('/swap/startHearBeat', async (req, response) => {
	const { query = {}, body } = req;
	const {
		time,
		date,
		interval = INTERVAL,
		limit = 1500,
		isAutoReset = false,
		isInit = false,
	} = query;
	try {
		dealDetailList = [];
		mostLoss = INIT_MOST_LOSS;

		if (isAutoReset) {
			totalProfit = 0;
			currentPosition = {};
			longPosition = { entryPrice: 0, positionAmt: 0 };
			shortPosition = { entryPrice: 0, positionAmt: 0 };
			dealDetailList = [];
			mostLoss = INIT_MOST_LOSS;
			maxWinRatio = 0;
			dealDetailList = [];
			maxOpenPosition = 0;
		}

		// const mock = require(`./mock/${date}.js`);
		// const list = mock.mockData

		const payload = {
			interval,
			// endTime: moment(Number(time)).add(1, "days").valueOf(),
			limit,
			startTime: time,
		};
		const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
		const list = data;

		if (isInit) {
			lastHistoryList = [];
		}

		const newList = JSON.parse(JSON.stringify(list));
		newList.pop();
		const macdList = getCurrentMacd(newList, lastMacd).slice(-limit);
		const rsiList = [];
		const bollList = getCurrentBOLL(newList).slice(-limit);

		lastMacd = macdList[macdList.length - 1];
		lastRSI = {};

		const result = {
			macdList,
			rsiList,
			bollList,
		};

		await checkDeal(result, isAutoReset);
		// const longActualProfit =
		//   ((currentMarketPrice - longPosition.entryPrice) *
		//     longPosition.positionAmt) /
		//   currentMarketPrice;
		// const shortActualProfit =
		//   (-(currentMarketPrice - shortPosition.entryPrice) *
		//     shortPosition.positionAmt) /
		//   currentMarketPrice;
		// const actualProfit = totalProfit + longActualProfit + shortActualProfit;
		send(response, {
			errcode: 0,
			errmsg: 'ok',
			data: {
				// history: list,
				// index: result,
				totalProfit: totalProfit || -0.0000001,
				totalPosition,
				totalCapital,
				minTotalCapital,
				maxOpenPosition,
				currentPosition,
				dealDetailList,
				mostLoss,
				maxContinuousWin,
				maxContinuousLoss,
				longPosition,
				shortPosition,
				baoNumTotal,
				lastWinOrLoss,
				lastPosition,
				// actualProfit,
			},
		});
	} catch (e) {
		console.log(e);
		restart('startHearBeat');
	}
});

app.get('/swap/getLatestProfit', async (req, response) => {
	const { query = {} } = req;
	const { time, interval = INTERVAL, limit = 500 } = query;
	try {
		const payload = {
			interval,
			limit,
			endTime: time,
		};
		const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
		const list = data;
		totalProfit = 0;
		// currentPosition = {};
		// longPosition = { entryPrice: 0, positionAmt: 0 };
		// shortPosition = { entryPrice: 0, positionAmt: 0 };
		dealDetailList = [];
		// mostLoss = INIT_MOST_LOSS;
		maxWinRatio = 0;
		maxOpenPosition = 0;
		totalCapital = ORIGIN_TOTAL_CAPITAL;

		const newList = JSON.parse(JSON.stringify(list));
		newList.pop();

		const bollList = getCurrentBOLL(newList).slice(-1400);
		const macdList = getCurrentMacd(newList).slice(-1400);
		const rsiList = getCurrentRSI(newList).slice(-1400);

		const result = {
			macdList,
			rsiList,
			bollList,
		};
		await checkDeal(result);
		const longActualProfit =
			((currentMarketPrice - longPosition.entryPrice) *
				longPosition.positionAmt) /
			currentMarketPrice;
		const shortActualProfit =
			(-(currentMarketPrice - shortPosition.entryPrice) *
				shortPosition.positionAmt) /
			currentMarketPrice;
		const actualProfit = totalProfit + longActualProfit + shortActualProfit;
		console.log('currentMarketPrice', currentMarketPrice);
		send(response, {
			errcode: 0,
			errmsg: 'ok',
			data: {
				// index: result,
				totalProfit,
				dealDetailList,
				mostLoss,
				maxContinuousWin,
				maxContinuousLoss,
				longPosition,
				shortPosition,
				baoNumTotal,
				lastWinOrLoss,
				lastPosition,
				maxOpenPosition,
				actualProfit,
				minTotalCapital,
			},
		});
	} catch (e) {
		console.log(e);
		restart();
	}
});

function fibonacci(n) {
	if (n == 1 || n == 2) {
		return 1;
	}
	return fibonacci(n - 2) + fibonacci(n - 1);
}

const checkDeal = async (data, isAutoReset = true) => {
	data.bollList = data.bollList || [];

	for (let i = 0; i < data.bollList.length - 9; i++) {
		checkByStep(
			{
				macdList: data.macdList.slice(i, i + 10),
				rsiList: data.rsiList.slice(i, i + 10),
				bollList: data.bollList.slice(i, i + 10),
			},
			isAutoReset && i == data.macdList.length - 10
		);
	}

	function checkByStep(data, isForceDeal) {
		// isForceDeal = false;
		const { macdList, rsiList, bollList } = data;

		// macdList.slice(-3);
		const mark_price = macdList[macdList.length - 1].close;
		currentMarketPrice = mark_price;

		let longHolding;
		let shortHolding;
		let longRatio = 0;
		let shortRatio = 0;
		let holding;

		if (longPosition && longPosition.positionAmt) {
			longHolding = JSON.parse(JSON.stringify(longPosition));
			holding = longHolding;
		}
		if (shortPosition && shortPosition.positionAmt) {
			shortHolding = JSON.parse(JSON.stringify(shortPosition));
			holding = shortHolding;
		}

		if (longHolding) {
			const { leverage, entryPrice: avg_cost } = longHolding;
			longRatio =
				((Number(mark_price) - Number(avg_cost)) * Number(leverage)) /
				Number(mark_price);
			maxWinRatio = Math.max(maxWinRatio, longRatio);
		}

		if (shortHolding) {
			const { leverage, entryPrice: avg_cost } = shortHolding;
			shortRatio =
				((Number(mark_price) - Number(avg_cost)) * Number(leverage)) /
				Number(mark_price);
			shortRatio = -shortRatio;
			maxWinRatio = Math.max(maxWinRatio, shortRatio);
		}

		const DOWN_BOLL_CONDITION =
			Number(bollList[bollList.length - 2].MA) >
			Number(bollList[bollList.length - 1].MA);

		const longWinRatio = longHolding
			? longRatio * Math.abs(Number(longHolding.positionAmt))
			: 0;

		const shortWinRatio = shortHolding
			? shortRatio * Math.abs(Number(shortHolding.positionAmt))
			: 0;

		const totalWin = longWinRatio + shortWinRatio;

		const CENTER_CROSS_LONG_CONDITION =
			Number(macdList[macdList.length - 2].close) <
				Number(bollList[bollList.length - 2].MA) &&
			Number(macdList[macdList.length - 1].close) >
				Number(bollList[bollList.length - 1].MA);

		const CENTER_CROSS_SHORT_CONDITION =
			Number(macdList[macdList.length - 2].close) >
				Number(bollList[bollList.length - 2].MA) &&
			Number(macdList[macdList.length - 1].close) <
				Number(bollList[bollList.length - 1].MA);

		const CONTINUOUS_LONG_CONDITION =
			Number(macdList[macdList.length - 3].close) <
				Number(bollList[bollList.length - 3].MA) &&
			Number(macdList[macdList.length - 2].close) >
				Number(bollList[bollList.length - 2].MA) &&
			Number(macdList[macdList.length - 1].close) >
				Number(bollList[bollList.length - 1].MA);

		const CONTINUOUS_SHORT_CONDITION =
			Number(macdList[macdList.length - 3].close) >
				Number(bollList[bollList.length - 3].MA) &&
			Number(macdList[macdList.length - 2].close) <
				Number(bollList[bollList.length - 2].MA) &&
			Number(macdList[macdList.length - 1].close) <
				Number(bollList[bollList.length - 1].MA);

		const OUT_HIGH_CONDITION =
			Number(macdList[macdList.length - 2].close) <
				Number(bollList[bollList.length - 2].UP) &&
			Number(macdList[macdList.length - 1].close) >
				Number(bollList[bollList.length - 1].UP);

		const OUT_LOW_CONDITION =
			Number(macdList[macdList.length - 2].close) >
				Number(bollList[bollList.length - 2].DN) &&
			Number(macdList[macdList.length - 1].close) <
				Number(bollList[bollList.length - 1].DN);

		const CONVERSE_UP_CONDITION =
			Number(macdList[macdList.length - 2].close) >
				Number(bollList[bollList.length - 2].UP) &&
			Number(macdList[macdList.length - 1].close) <
				Number(bollList[bollList.length - 1].UP) &&
			Number(macdList[macdList.length - 1].close) >
				Number(bollList[bollList.length - 1].MA);

		const CONVERSE_LOW_CONDITION =
			Number(macdList[macdList.length - 2].close) <
				Number(bollList[bollList.length - 2].DN) &&
			Number(macdList[macdList.length - 1].close) >
				Number(bollList[bollList.length - 1].DN) &&
			Number(macdList[macdList.length - 1].close) <
				Number(bollList[bollList.length - 1].MA);

		const CLOSE_MORE_HIGH_CONDITION =
			Number(macdList[macdList.length - 1].close) >
			Number(bollList[bollList.length - 1].UP);

		const CLOSE_LESS_HIGH_CONDITION =
			Number(macdList[macdList.length - 1].close) <
			Number(bollList[bollList.length - 1].UP);

		const CLOSE_MORE_LOW_CONDITION =
			Number(macdList[macdList.length - 1].close) >
			Number(bollList[bollList.length - 1].DN);

		const CLOSE_LESS_LOW_CONDITION =
			Number(macdList[macdList.length - 1].close) <
			Number(bollList[bollList.length - 1].DN);

		let totalRatio = 0;
		if (longHolding && !shortHolding) {
			totalRatio = longRatio;
		} else if (!longHolding && shortHolding) {
			totalRatio = shortRatio;
		} else if (longHolding && shortHolding) {
			totalRatio =
				(longRatio * Math.abs(longHolding.positionAmt) +
					shortRatio * Math.abs(shortHolding.positionAmt)) /
				(Math.abs(longHolding.positionAmt) +
					Math.abs(shortHolding.positionAmt));
		}

		const LAST_SECOND_LONG_CONDITION =
			Number(macdList[macdList.length - 2].close) >
				Number(bollList[bollList.length - 2].MA) &&
			Number(macdList[macdList.length - 2].open) >
				Number(bollList[bollList.length - 2].MA);

		const LAST_SECOND_SHORT_CONDITION =
			Number(macdList[macdList.length - 2].close) <
				Number(bollList[bollList.length - 2].MA) &&
			Number(macdList[macdList.length - 2].open) <
				Number(bollList[bollList.length - 2].MA);

		const BOLL_CONTINOUS_LONG =
			Number(bollList[bollList.length - 3].MA) >
				Number(bollList[bollList.length - 2].MA) &&
			Number(bollList[bollList.length - 4].MA) >
				Number(bollList[bollList.length - 3].MA) &&
			Number(bollList[bollList.length - 5].MA) >
				Number(bollList[bollList.length - 4].MA);

		const BOLL_CONTINOUS_SHORT =
			Number(bollList[bollList.length - 3].MA) <
				Number(bollList[bollList.length - 2].MA) &&
			Number(bollList[bollList.length - 4].MA) <
				Number(bollList[bollList.length - 3].MA) &&
			Number(bollList[bollList.length - 5].MA) <
				Number(bollList[bollList.length - 4].MA);

		const RSI_UP =
			rsiList[rsiList.length - 1].RSI1 >
				rsiList[rsiList.length - 1].RSI2 &&
			rsiList[rsiList.length - 1].RSI2 >
				rsiList[rsiList.length - 1].RSI3 &&
			rsiList[rsiList.length - 1].RSI3 >= 50;
		const RSI_DOWN =
			rsiList[rsiList.length - 1].RSI1 <
				rsiList[rsiList.length - 1].RSI2 &&
			rsiList[rsiList.length - 1].RSI2 <
				rsiList[rsiList.length - 1].RSI3 &&
			rsiList[rsiList.length - 1].RSI3 < 50;
		const MACD_UP =
			macdList[macdList.length - 1].column >
			macdList[macdList.length - 2].column;
		const MACD_DOWN =
			macdList[macdList.length - 1].column <
			macdList[macdList.length - 2].column;

		// const MAIN_OPEN_LONG_CONDITION1 =
		//   !longHolding && CENTER_CROSS_SHORT_CONDITION && RSI_UP;

		// const MAIN_OPEN_SHORT_CONDITION1 =
		//   !shortHolding && CENTER_CROSS_LONG_CONDITION && RSI_DOWN;

		// const MAIN_CLOSE_LONG_CONDITION1 = longHolding && RSI_DOWN;

		// const MAIN_CLOSE_SHORT_CONDITION1 = shortHolding && RSI_UP;

		// const latestMACD = macdList[macdList.length - 1];
		// const HIGH_20_CONDITION = macdList.every(
		//   (item) => latestMACD.close >= item.close
		// );

		// const LOW_20_CONDITION = macdList.every(
		//   (item) => latestMACD.close <= item.close
		// );

		// const HIGH_10_CONDITION = macdList.every(
		//   (item) => latestMACD.close >= item.close
		// );

		// const LOW_10_CONDITION = macdList.every(
		//   (item) => latestMACD.close <= item.close
		// );

		// const MAIN_OPEN_LONG_CONDITION1 = !longHolding && HIGH_20_CONDITION;

		// const MAIN_OPEN_SHORT_CONDITION1 = !shortHolding && LOW_20_CONDITION;

		// const MAIN_CLOSE_LONG_CONDITION1 = longHolding && LOW_10_CONDITION;

		// const MAIN_CLOSE_SHORT_CONDITION1 = shortHolding && HIGH_10_CONDITION;

		const BATCH_LONG_OPEN_CONDITION =
			!longHolding &&
			shortHolding &&
			Math.abs(shortHolding.positionAmt) >
				INIT_POSITION * MAX_OPEN_POSITION_RATIO &&
			OUT_HIGH_CONDITION;

		const BATCH_SHORT_OPEN_CONDITION =
			!shortHolding &&
			longHolding &&
			Math.abs(longHolding.positionAmt) >
				INIT_POSITION * MAX_OPEN_POSITION_RATIO &&
			OUT_LOW_CONDITION;

		const BATCH_LONG_CLOSE_CONDITION =
			longHolding &&
			shortHolding &&
			Math.abs(longHolding.positionAmt) >
				INIT_POSITION * MAX_OPEN_POSITION_RATIO &&
			Math.abs(shortHolding.positionAmt) >
				INIT_POSITION * MAX_OPEN_POSITION_RATIO &&
			CENTER_CROSS_SHORT_CONDITION;

		const BATCH_SHORT_CLOSE_CONDITION =
			longHolding &&
			shortHolding &&
			Math.abs(longHolding.positionAmt) >
				INIT_POSITION * MAX_OPEN_POSITION_RATIO &&
			Math.abs(shortHolding.positionAmt) >
				INIT_POSITION * MAX_OPEN_POSITION_RATIO &&
			CENTER_CROSS_LONG_CONDITION;

		let totalPosition = 0;
		if (longHolding && shortHolding) {
			totalPosition =
				Math.abs(Number(longHolding.positionAmt)) +
				Math.abs(Number(shortHolding.positionAmt));
		}

		const RSI_LONG = rsiList[rsiList.length - 1].RSI3 >= 50;
		const RSI_SHORT = rsiList[rsiList.length - 1].RSI3 < 50;

		const MACD_LONG_REVERSE =
			Number(macdList[macdList.length - 2].column) >= 0 &&
			Number(macdList[macdList.length - 2].column) <
				Number(macdList[macdList.length - 1].column) &&
			Number(macdList[macdList.length - 1].close) <
				Number(macdList[macdList.length - 1].open);

		const MACD_SHORT_REVERSE =
			Number(macdList[macdList.length - 2].column) < 0 &&
			Number(macdList[macdList.length - 2].column) >
				Number(macdList[macdList.length - 1].column) &&
			Number(macdList[macdList.length - 1].close) >
				Number(macdList[macdList.length - 1].open);

		const MACD_LONG = Number(macdList[macdList.length - 1].column) >= 0;
		const MACD_SHORT = Number(macdList[macdList.length - 1].column) < 0;

		const PRICE_LOW_MA =
			Number(macdList[macdList.length - 1].close) <
			Number(bollList[bollList.length - 1].MA);
		const PRICE_UP_MA =
			Number(macdList[macdList.length - 1].close) >
			Number(bollList[bollList.length - 1].MA);

		const MAIN_OPEN_LONG_CONDITION1 =
			!longHolding && MACD_LONG_REVERSE && PRICE_UP_MA;

		const MAIN_OPEN_SHORT_CONDITION1 =
			!shortHolding && MACD_SHORT_REVERSE && PRICE_LOW_MA;

		const CLOSE_ALL_LONG_CONDITION = false;
		const CLOSE_ALL_SHORT_CONDITION = false;

		const MAIN_CLOSE_LONG_CONDITION1 =
			longHolding && (MACD_SHORT_REVERSE || CONVERSE_LOW_CONDITION);

		const MAIN_CLOSE_SHORT_CONDITION1 =
			shortHolding && (MACD_LONG_REVERSE || CONVERSE_UP_CONDITION);

		const MAIN_OPEN_LONG_CONDITION2 =
			!longHolding && CENTER_CROSS_SHORT_CONDITION;
		const MAIN_OPEN_SHORT_CONDITION2 =
			!shortHolding && CENTER_CROSS_LONG_CONDITION;
		const MAIN_CLOSE_LONG_CONDITION2 =
			longHolding && CENTER_CROSS_LONG_CONDITION;
		const MAIN_CLOSE_SHORT_CONDITION2 =
			shortHolding && CENTER_CROSS_SHORT_CONDITION;

		modeChange = false;
		let openLongCondition =
			MODE == 1 ? MAIN_OPEN_LONG_CONDITION1 : MAIN_OPEN_LONG_CONDITION2;
		let openShortCondition =
			MODE == 1 ? MAIN_OPEN_SHORT_CONDITION1 : MAIN_OPEN_SHORT_CONDITION2;
		let closeLongCondition =
			MODE == 1 ? MAIN_CLOSE_LONG_CONDITION1 : MAIN_CLOSE_LONG_CONDITION2;
		let closeShortCondition =
			MODE == 1
				? MAIN_CLOSE_SHORT_CONDITION1
				: MAIN_CLOSE_SHORT_CONDITION2;

		NEW_POSITION_RATIO = 1;
		// if (longHolding || shortHolding) NEW_POSITION_RATIO = 2;
		// if (CLOSE_CONDITION) NEW_POSITION_RATIO = 1;

		console.log('************************************');

		console.log('longRatio', longRatio, 'shortRatio', shortRatio);
		console.log(
			'longPositionAmt',
			longHolding ? longHolding.positionAmt : 0,
			'shortPositionAmt',
			shortHolding ? shortHolding.positionAmt : 0
		);
		console.log(
			'closeLongCondition',
			closeLongCondition,
			'closeShortCondition',
			closeShortCondition,
			'openLongCondition',
			openLongCondition,
			'openShortCondition',
			openShortCondition,
			'NEW_POSITION_RATIO',
			NEW_POSITION_RATIO
		);
		console.log('************************************');

		if (isForceDeal) {
			closeLongCondition = true;
			closeShortCondition = true;
			openLongCondition = false;
			openShortCondition = false;
		}

		// IS_CLOSE_ALL_POSITION = false;
		// if (isForceDeal) {
		//   closeLongCondition = true;
		//   closeShortCondition = true;
		// } else if (openLongCondition || openShortCondition) {
		//   if (
		//     (longHolding &&
		//       Math.abs(Number(longHolding.positionAmt)) >=
		//         CLOSE_SAME_POSITION_RATIO) ||
		//     (shortHolding &&
		//       Math.abs(Number(shortHolding.positionAmt)) >=
		//         CLOSE_SAME_POSITION_RATIO)
		//   ) {
		//     isForceDeal = true;
		//     closeLongCondition = true;
		//     closeShortCondition = true;
		//   }
		// }

		// NEW_POSITION_RATIO =
		//   60 /
		//   (Number(bollList[bollList.length - 1].UP) -
		//     Number(bollList[bollList.length - 1].DN));

		let fiIndex = INCREASE_FI_LIST.findIndex(
			(item) => holding && item == Number(holding.positionAmt)
		);

		fiIndex =
			fiIndex == INCREASE_FI_LIST.length - 1
				? INCREASE_FI_LIST.length - 2
				: fiIndex;

		// console.log(
		//   "************************************",
		//   moment().format("YYYY-MM-DD HH:mm:ss")
		// );
		// console.log("------------------");
		// console.log("mark_price", mark_price);
		// console.log("bollList", bollList.slice(-1));
		// console.log("------------------");

		const patchPosition = async (holding, direction) => {
			let positionAmt = Number(holding.positionAmt) + INIT_POSITION;
			const price =
				(Number(mark_price) * Number(holding.positionAmt) +
					Number(holding.entryPrice) * Number(holding.positionAmt)) /
				positionAmt;

			// totalProfit += (-0.01 * 0 * positionAmt) / 2;
			// totalCapital += (-0.01 * 0 * positionAmt) / 2;
			// if (totalCapital < positionAmt / 2) positionAmt = 0;
			maxOpenPosition = Math.max(
				maxOpenPosition,
				longPosition.positionAmt || 0,
				shortPosition.positionAmt || 0
			);

			if (direction == 'LONG') {
				longPosition = {
					positionSide: direction,
					leverage: LEVERAGE,
					entryPrice: price,
					positionAmt,
					time: macdList[macdList.length - 1].time,
					week: macdList[macdList.length - 1].week,
				};
			} else {
				shortPosition = {
					positionSide: direction,
					leverage: LEVERAGE,
					entryPrice: price,
					positionAmt,
					time: macdList[macdList.length - 1].time,
					week: macdList[macdList.length - 1].week,
				};
			}
			const dealDetail = {
				side: 'OPEN',
				positionSide: direction,
				leverage: LEVERAGE,
				entryPrice: price,
				positionAmt,
				time: macdList[macdList.length - 1].time,
				macdList,
				rsiList,
				bollList,
			};

			dealDetailList.push(dealDetail);
			if (direction == 'LONG') {
				longPatchNum += 1;
			} else {
				shortPatchNum += 1;
			}
		};

		const closeLong = async () => {
			if (
				shortHolding &&
				Number(shortHolding.positionAmt) &&
				// shortPatchNum <= 1 &&
				shortRatio < 0 &&
				false
			) {
				await patchPosition(shortHolding, 'SHORT');
			} else if (longHolding && Number(longHolding.positionAmt)) {
				if (longRatio < LOSS_MAX && longPatchNum < 3 && false) {
					await patchPosition(longHolding, 'LONG');
				} else if (
					longRatio < LOSS_MAX ||
					longRatio > WIN_MAX ||
					true
				) {
					if (longRatio < 0) modeChange = true;
					if (longRatio < LOSS_MAX) {
						baoNumTotal++;
						// openLongCondition = false;
						// openShortCondition = true;
					}

					let closePositionAmt = INIT_POSITION;
					// let closePositionAmt = longHolding.positionAmt;
					if (CLOSE_ALL_LONG_CONDITION)
						closePositionAmt = longHolding.positionAmt;
					if (isForceDeal)
						// if (
						//   longHolding &&
						//   Math.abs(longHolding.positionAmt) >
						//     INIT_POSITION * MAX_OPEN_POSITION_RATIO
						// )
						//   closePositionAmt = longHolding.positionAmt;
						closePositionAmt = longHolding.positionAmt;
					// let closePositionAmt =
					//   longHolding.positionAmt == INIT_POSITION
					//     ? INIT_POSITION
					//     : longHolding.positionAmt;
					// if (longRatio < 0)
					//   closePositionAmt = Math.min(INIT_POSITION * 3, closePositionAmt);
					const currentProfit =
						(longRatio * closePositionAmt) / LEVERAGE -
						0.01 * 0 * closePositionAmt;
					totalProfit += currentProfit;
					totalCapital += currentProfit;
					minTotalCapital = Math.min(minTotalCapital, totalCapital);

					const closePrice = Number(mark_price);

					const positionAmt =
						longHolding.positionAmt - closePositionAmt;
					// const entryPrice = positionAmt
					// 	? Math.abs(
					// 			(Math.abs(Number(longHolding.positionAmt)) *
					// 				Number(mark_price) -
					// 				closePositionAmt * longHolding.entryPrice) /
					// 				positionAmt
					// 	  )
					// 	: 0;
					const entryPrice = positionAmt ? longHolding.entryPrice : 0;

					const priceBeforeDeal = longPosition.entryPrice;

					longHolding.entryPrice = entryPrice;
					longHolding.positionAmt = positionAmt;
					longPosition.entryPrice = entryPrice;
					longPosition.positionAmt = positionAmt;

					const dealDetail = {
						side: 'CLOSE',
						positionSide: 'LONG',
						closePrice,
						closePositionAmt,
						entryPrice,
						priceBeforeDeal,
						positionAmt,
						time: macdList[macdList.length - 1].time,
						week: macdList[macdList.length - 1].week,
						totalProfit,
						totalCapital,
						currentProfit,
						currentRMB: currentProfit * closePrice,
						macd: macdList[macdList.length - 1],
						rsi: rsiList[rsiList.length - 1],
						bollList: bollList[bollList.length - 1],
						MODE,
						longRatio,
						longPosition,
						longPositionAmt: longPosition.positionAmt,
						shortPosition,
						shortPositionAmt: shortPosition.positionAmt,
						shortRatio,
					};
					dealDetailList.push(dealDetail);
					if (longRatio < mostLoss.profit) {
						mostLoss = {
							profit: (longRatio * closePositionAmt) / LEVERAGE,
							time: macdList[macdList.length - 1].time,
						};
					}

					maxWinRatio = 0;
					longPatchNum = 0;
				}
			}
		};

		const closeShort = async () => {
			if (
				longHolding &&
				Number(longHolding.positionAmt) &&
				// longPatchNum <= 1 &&
				longRatio < 0 &&
				false
			) {
				await patchPosition(longHolding, 'LONG');
			} else if (shortHolding && Number(shortHolding.positionAmt)) {
				if (shortRatio < LOSS_MAX && shortPatchNum < 3 && false) {
					await patchPosition(shortHolding, 'SHORT');
				} else if (
					shortRatio < LOSS_MAX ||
					shortRatio > WIN_MAX ||
					true
				) {
					if (shortRatio < LOSS_MAX) {
						baoNumTotal++;
						// openLongCondition = true;
						// openShortCondition = false;
					}
					if (shortRatio < 0) modeChange = true;
					// let closePositionAmt = Math.abs(Number(shortHolding.positionAmt));
					let closePositionAmt = INIT_POSITION;
					if (CLOSE_ALL_SHORT_CONDITION)
						closePositionAmt = Math.abs(
							Number(shortHolding.positionAmt)
						);
					// if (
					//   shortHolding &&
					//   Math.abs(shortHolding.positionAmt) >
					//     INIT_POSITION * MAX_OPEN_POSITION_RATIO
					// )
					//   closePositionAmt = Math.abs(Number(shortHolding.positionAmt));
					if (isForceDeal)
						closePositionAmt = Math.abs(
							Number(shortHolding.positionAmt)
						);
					// let closePositionAmt =
					//   shortHolding.positionAmt == INIT_POSITION
					//     ? INIT_POSITION
					//     : shortHolding.positionAmt;
					// if (shortRatio < 0)
					//   closePositionAmt = Math.min(INIT_POSITION * 3, closePositionAmt);
					const currentProfit =
						(shortRatio * closePositionAmt) / LEVERAGE -
						0.01 * 0 * closePositionAmt;
					totalProfit += currentProfit;
					totalCapital += currentProfit;
					minTotalCapital = Math.min(minTotalCapital, totalCapital);

					const closePrice = Number(mark_price);

					const positionAmt =
						Math.abs(Number(shortHolding.positionAmt)) -
						closePositionAmt;
					// const entryPrice = positionAmt
					// 	? Math.abs(
					// 			(Math.abs(Number(shortHolding.positionAmt)) *
					// 				Number(mark_price) -
					// 				closePositionAmt *
					// 					shortHolding.entryPrice) /
					// 				positionAmt
					// 	  )
					// 	: 0;
					const entryPrice = positionAmt
						? shortHolding.entryPrice
						: 0;

					const priceBeforeDeal = shortPosition.entryPrice;

					shortHolding.entryPrice = entryPrice;
					shortHolding.positionAmt = positionAmt;
					shortPosition.entryPrice = entryPrice;
					shortPosition.positionAmt = positionAmt;

					const dealDetail = {
						side: 'CLOSE',
						positionSide: 'SHORT',
						closePrice,
						closePositionAmt,
						priceBeforeDeal,
						entryPrice,
						positionAmt,
						time: macdList[macdList.length - 1].time,
						week: macdList[macdList.length - 1].week,
						totalProfit,
						totalCapital,
						currentProfit,
						currentRMB: currentProfit * closePrice,
						macd: macdList[macdList.length - 1],
						rsi: rsiList[rsiList.length - 1],
						bollList: bollList[bollList.length - 1],
						MODE,
						longRatio,
						longPosition,
						longPositionAmt: longPosition.positionAmt,
						shortPosition,
						shortPositionAmt: shortPosition.positionAmt,
						shortRatio,
					};
					dealDetailList.push(dealDetail);
					if (shortRatio < mostLoss.profit) {
						mostLoss = {
							profit:
								(shortRatio * shortHolding.positionAmt) /
								LEVERAGE,
							time: macdList[macdList.length - 1].time,
						};
					}

					maxWinRatio = 0;
					shortPatchNum = 0;
				}
			}
		};

		//平多仓条件
		if (closeLongCondition) {
			try {
				closeLong();
				// if(longRatio > WIN_MAX * 2) MODE = DEFAULT_MODE
			} catch (e) {
				console.log(e);
			}
		}

		//平空仓条件
		if (closeShortCondition) {
			try {
				closeShort();
				const increasePosition = INCREASE_FI_LIST[fiIndex + 1];
				// if(shortRatio > WIN_MAX * 2) MODE = DEFAULT_MODE
			} catch (e) {
				console.log(e);
			}
		}

		// if ((totalCapital * LEVERAGE) / 10 > ORIGIN_INIT_POSITION * 4) {
		//   receiveCapital += totalCapital - (ORIGIN_INIT_POSITION * 4) / LEVERAGE;
		//   totalCapital = totalCapital - receiveCapital;
		// }

		// if (closeLongCondition || closeShortCondition) {
		//   if (longRatio > WIN_MAX || shortRatio > WIN_MAX) {
		//     POSITION_RATIO = POSITION_RATIO_DEFAULT * 10;
		//   } else {
		//     POSITION_RATIO = POSITION_RATIO_DEFAULT;
		//   }
		// }

		// INIT_POSITION =
		//   longRatio > WIN_MAX || shortRatio > WIN_MAX
		//     ? Math.min(
		//         (totalCapital * LEVERAGE) / POSITION_RATIO,
		//         ORIGIN_INIT_POSITION * 2
		//       )
		//     : Math.min(
		//         (totalCapital * LEVERAGE) / POSITION_RATIO,
		//         ORIGIN_INIT_POSITION * 2
		//       );

		// INIT_POSITION = (totalCapital * LEVERAGE) / POSITION_RATIO;

		//开多仓条件
		if (openLongCondition) {
			try {
				if (
					true ||
					!longHolding ||
					!Number(longHolding.positionAmt)
					// &&
					// &&
					// !shortPatchNum
					// (!shortHolding || !Number(shortHolding.positionAmt))
				) {
					// closeShort()
					// const openPositionAmt =
					//   shortRatio < LOSS_MAX ? INIT_POSITION * 2 : INIT_POSITION;
					let openPositionAmt = INIT_POSITION;
					// if (BATCH_LONG_OPEN_CONDITION)
					//   openPositionAmt = INIT_POSITION * (MAX_OPEN_POSITION_RATIO + 1);
					// let openPositionAmt = longHolding
					//   ? Math.abs(longHolding.positionAmt)
					//   : INIT_POSITION * 1;
					// if (shortHolding) {
					//   openPositionAmt = 2 * INIT_POSITION;
					// }
					// openPositionAmt = Math.min(openPositionAmt, INIT_POSITION * 16);
					// const ratio = shortRatio;
					// const increasePosition = INCREASE_FI_LIST[fiIndex + 1];
					// const decreasePosition = INCREASE_FI_LIST[0];
					// if (ratio < WIN_MAX) {
					//   openPositionAmt = increasePosition;
					// }
					// else if (ratio < LOSS_MAX) {
					//   openPositionAmt = decreasePosition;
					// }
					// if(modeChange) openPositionAmt = INIT_POSITION;

					// if (totalCapital * LEVERAGE < openPositionAmt) openPositionAmt = 0;
					totalCapital += -0.01 * 0 * openPositionAmt;
					totalProfit += -0.01 * 0 * openPositionAmt;
					totalPosition += openPositionAmt;

					minTotalCapital = Math.min(minTotalCapital, totalCapital);
					maxOpenPosition = Math.max(
						maxOpenPosition,
						longPosition.positionAmt
					);
					const averagePrice =
						(longPosition.entryPrice * longPosition.positionAmt +
							openPositionAmt * mark_price) /
						(longPosition.positionAmt + openPositionAmt);

					const totalPositionAmt =
						longPosition.positionAmt + openPositionAmt;

					longPosition = {
						positionSide: 'LONG',
						leverage: LEVERAGE,
						entryPrice: averagePrice,
						positionAmt: totalPositionAmt,
						time: macdList[macdList.length - 1].time,
					};
					const dealDetail = {
						side: 'OPEN',
						positionSide: 'LONG',
						leverage: LEVERAGE,
						entryPrice: mark_price,
						openPositionAmt,
						positionAmt: totalPositionAmt,
						averagePrice,
						time: macdList[macdList.length - 1].time,
						week: macdList[macdList.length - 1].week,
						macdList,
						rsiList,
						bollList,
						MODE,
						totalProfit,
						totalCapital,
						longRatio,
						longPosition,
						longPositionAmt: longPosition.positionAmt,
						shortPosition,
						shortPositionAmt: shortPosition.positionAmt,
						shortRatio,
					};
					dealDetailList.push(dealDetail);
					// shortHolding = {};
					// shortPosition = {};

					// if(ratio < LOSS_MAX * 1) MODE = MODE == 1 ? 2 : 1
				}
			} catch (e) {
				console.log(e);
			}
		}

		//开空仓条件
		if (openShortCondition) {
			try {
				if (
					// !longHolding ||
					// !Number(longHolding.positionAmt)
					// &&
					true ||
					!shortHolding ||
					!Number(shortHolding.positionAmt)
					// &&
					// !longPatchNum
				) {
					// closeLong()
					// const openPositionAmt =
					//   longRatio < LOSS_MAX ? INIT_POSITION * 2 : INIT_POSITION;
					let openPositionAmt = INIT_POSITION;
					// if (BATCH_SHORT_OPEN_CONDITION)
					//   openPositionAmt = INIT_POSITION * (MAX_OPEN_POSITION_RATIO + 1);
					// let openPositionAmt = shortHolding
					//   ? Math.abs(shortHolding.positionAmt)
					//   : INIT_POSITION * 1;
					// if (longHolding) {
					//   openPositionAmt = 2 * INIT_POSITION;
					// }
					// openPositionAmt = Math.min(openPositionAmt, INIT_POSITION * 16);
					// const ratio = longRatio;
					// const increasePosition = INCREASE_FI_LIST[fiIndex + 1];
					// const decreasePosition = INCREASE_FI_LIST[0];
					// if (ratio < WIN_MAX) {
					//   openPositionAmt = increasePosition;
					// }
					// else if (ratio < LOSS_MAX) {
					//   openPositionAmt = decreasePosition;
					// }
					// if(modeChange) openPositionAmt = INIT_POSITION;

					// if (totalCapital * LEVERAGE < openPositionAmt) openPositionAmt = 0;
					totalCapital += -0.01 * 0 * openPositionAmt;
					totalProfit += -0.01 * 0 * openPositionAmt;
					totalPosition += openPositionAmt;

					minTotalCapital = Math.min(minTotalCapital, totalCapital);
					maxOpenPosition = Math.max(
						maxOpenPosition,
						shortPosition.positionAmt
					);
					const averagePrice =
						(shortPosition.entryPrice *
							Math.abs(Number(shortPosition.positionAmt)) +
							openPositionAmt * mark_price) /
						(Math.abs(Number(shortPosition.positionAmt)) +
							openPositionAmt);

					const totalPositionAmt =
						Math.abs(Number(shortPosition.positionAmt)) +
						openPositionAmt;

					shortPosition = {
						positionSide: 'SHORT',
						leverage: LEVERAGE,
						entryPrice: averagePrice,
						positionAmt: totalPositionAmt,
						time: macdList[macdList.length - 1].time,
					};
					const dealDetail = {
						side: 'OPEN',
						positionSide: 'SHORT',
						leverage: LEVERAGE,
						entryPrice: mark_price,
						openPositionAmt,
						positionAmt: totalPositionAmt,
						averagePrice,
						time: macdList[macdList.length - 1].time,
						week: macdList[macdList.length - 1].week,
						macdList,
						rsiList,
						bollList,
						MODE,
						totalProfit,
						totalCapital,
						longRatio,
						longPosition,
						longPositionAmt: longPosition.positionAmt,
						shortPosition,
						shortPositionAmt: shortPosition.positionAmt,
						shortRatio,
					};
					dealDetailList.push(dealDetail);
					// longHolding = {};
					// longPosition = {};

					// if(ratio < LOSS_MAX * 1) MODE = MODE == 1 ? 2 : 1
				}
			} catch (e) {
				console.log(e);
			}
		}
	}
};

const readData = async () => {
	let dataConfig = JSON.parse(
		fs.readFileSync('./app/lastHistoryList.json', 'utf-8')
	);
	return dataConfig.lastHistoryList;
};

const writeData = async (data) => {
	//将修改后的配置写入文件前需要先转成json字符串格式
	let dataConfig = {
		lastHistoryList: JSON.stringify(data).toString(),
	};
	let jsonStr = JSON.stringify(dataConfig);

	const result = await new Promise((resolve) => {
		//将修改后的内容写入文件
		fs.writeFile('./app/lastHistoryList.json', jsonStr, function (err) {
			if (err) {
				// console.error(err);
			} else {
				// console.log('----------修改成功-------------');
				resolve(true);
			}
		});
	});

	return result;
};

// 定时获取交割合约账户信息
(async () => {
	// await startInterval();
})();
app.listen(8092);

console.log('8092 server start');

process.on('uncaughtException', function (err) {
	//打印出错误
	// console.log('uncaughtException',err);
	restart();
});

let exec = require('child_process').exec;
function restart(resource) {
	console.log('restarting......', resource);
	setTimeout(() => {
		exec('npm run restart:product', function (err, stdout, stderr) {
			if (err) {
				console.log('restarting failed');
			} else {
				console.log('restarting success');
			}
		});
	}, 1000 * 10);
}
