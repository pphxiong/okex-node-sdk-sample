import moment from 'moment';
import helper from '../utils/index';

const { cloneDeep } = helper;

const fs = require('fs');

const customAuthClientBN = require('./customAuthClientBN');

const BTC_SYMBOL = 'BTCUSDT';
const ETH_SYMBOL = 'ETHUSDT';
const EOS_SYMBOL = 'EOSUSDT';
const XRP_SYMBOL = 'XRPUSDT';
const DOGE_SYMBOL = 'DOGEUSDT';

const priceFixedMap = {
	[BTC_SYMBOL]: 1,
	[ETH_SYMBOL]: 2,
	[EOS_SYMBOL]: 3,
	[XRP_SYMBOL]: 4,
	[DOGE_SYMBOL]: 5,
};

const quantityFixedMap = {
	[BTC_SYMBOL]: 3,
	[ETH_SYMBOL]: 1,
	[EOS_SYMBOL]: 1,
	[XRP_SYMBOL]: 1,
	[DOGE_SYMBOL]: 1,
};

const LEVERAGE = 20;
const ATR_WIN_RATIO = 3;
const INIT_ASSETS_RATIO = 5;

const LOSS_MAX = (-LEVERAGE * 3.82/2) / 100;
const WIN_MAX = -LOSS_MAX;
let INIT_ASSETS = 52;

const INIT_LONG_SHORT_ASSETS_RATIO = 1;
const MAX_OFFSET_RATIO = Math.abs(LOSS_MAX);

let RESTART_TIME = 0;
let MODE = 1;
const DEFAULT_INTERVAL = '15m';
const INIT_POSITION = 100;
let rsi1 = 8;
let rsi2 = 12;
let rsi3 = 24;

let maxWinRatio = 0;

const fnIsLastUpOrLow = (macdList, bollList) => {
	let isUp = false;
	let isLow = false;
	for (let i = macdList.length - 1; i > 0; i -= 1) {
		const isCurrentUp =
			macdList[i].close < bollList[i].UP &&
			macdList[i - 1].close > bollList[i - 1].UP &&
			macdList[i].close > bollList[i].MA;
		const isCurrentLow =
			macdList[i].close > bollList[i].DN &&
			macdList[i - 1].close < bollList[i - 1].DN &&
			macdList[i].close < bollList[i].MA;
		if (isCurrentUp) {
			isUp = true;
			break;
		}
		if (isCurrentLow) {
			isLow = true;
			break;
		}
	}
	return { isUp, isLow };
};

const fnIsCurrentContinousUpper = (macdList, i) => {
	return (
		macdList[i].column > 0 &&
		macdList[i].column > macdList[i - 1].column &&
		macdList[i - 1].column > macdList[i - 2].column &&
		macdList[i - 2].column > macdList[i - 3].column &&
		macdList[i].column > macdList[i + 1].column
	);
};

const fnIsCurrentContinousLower = (macdList, i) => {
	return (
		macdList[i].column < 0 &&
		macdList[i].column < macdList[i - 1].column &&
		macdList[i - 1].column < macdList[i - 2].column &&
		macdList[i - 2].column < macdList[i - 3].column &&
		macdList[i].column < macdList[i + 1].column
	);
};

const fnIsMacdReverse = (macdList) => {
	const isUpper =
		macdList[macdList.length - 1].column >
		macdList[macdList.length - 2].column;
	const isLower =
		macdList[macdList.length - 1].column <
		macdList[macdList.length - 2].column;

	const isLatestContinousUpper = fnIsCurrentContinousUpper(
		macdList,
		macdList.length - 2
	);
	const isLatestContinousLower = fnIsCurrentContinousLower(
		macdList,
		macdList.length - 2
	);
	let isUpperReverse = false;
	let isLowerReverse = false;
	if (isLower) {
		if (isLatestContinousUpper) {
			for (let i = macdList.length - 5; i > 3; i -= 1) {
				const isCurrentContinousUpper = fnIsCurrentContinousUpper(
					macdList,
					i
				);
				if (isCurrentContinousUpper) {
					isUpperReverse =
						macdList[macdList.length - 2].close >=
							macdList[i].close &&
						macdList[macdList.length - 2].column <
							macdList[i].column;
					break;
				}
			}
		}
	} else if (isUpper) {
		if (isLatestContinousLower) {
			for (let i = macdList.length - 5; i > 3; i -= 1) {
				const isCurrentContinousLower = fnIsCurrentContinousLower(
					macdList,
					i
				);
				if (isCurrentContinousLower) {
					isLowerReverse =
						macdList[macdList.length - 2].close <=
							macdList[i].close &&
						macdList[macdList.length - 2].column >
							macdList[i].column;
					break;
				}
			}
		}
	}
	return { isUpperReverse, isLowerReverse };
};

async function checkByStep(data, symbol) {
	const { macdList, bollList, atrList } = data;
	let mark_price;
	try {
		const data = await cAuthClientBN.common.getMarkPrice(symbol);
		mark_price = Number(data.markPrice);
	} catch (e) {
		restart('getMarkPrice');
	}

	let longHolding;
	let shortHolding;
	let longRatio = 0;
	let shortRatio = 0;
	let avail = 0;

	if (positionChange || !globalHolding || !globalHolding.length || true) {
		try {
			const { positions: holding, availableBalance } =
				await cAuthClientBN.swap.getPosition();
			globalHolding =
				holding.filter(
					(item) =>
						item.positionAmt &&
						Math.abs(Number(item.positionAmt)) > 0
				) || [];
			positionChange = false;
			const currentTotalAsset = globalHolding
				.map((item) => Number(item.initialMargin))
				.reduce((pre, cur) => pre + cur, 0);
			INIT_ASSETS =
				(Number(availableBalance) + Number(currentTotalAsset)) /
				INIT_ASSETS_RATIO;

			// if (longHolding) {
			// 	INIT_ASSETS =
			// 		(Math.abs(Number(longHolding.positionAmt)) * mark_price) /
			// 		LEVERAGE;
			// } else if (shortHolding) {
			// 	INIT_ASSETS =
			// 		(Math.abs(Number(shortHolding.positionAmt)) * mark_price) /
			// 		LEVERAGE;
			// }

			// console.log('------------------');
			// console.log(
			// 	`availableBalance`,
			// 	availableBalance,
			// 	'currentTotalAsset',
			// 	currentTotalAsset,
			// 	'INIT_ASSETS',
			// 	INIT_ASSETS
			// );
			// console.log('------------------');
		} catch (e) {
			// if(result.error_message) throw new Error('Cannot get position!');
			restart('getPosition');
		}
	}

	let holding = globalHolding;
	if (holding && holding.length) {
		longHolding = holding.find(
			(item) =>
				item.symbol === symbol &&
				item.positionSide &&
				item.positionSide.toUpperCase() == 'LONG' &&
				Math.abs(Number(item.positionAmt)) > 0
		);
		shortHolding = holding.find(
			(item) =>
				item.symbol === symbol &&
				item.positionSide &&
				item.positionSide.toUpperCase() == 'SHORT' &&
				Math.abs(Number(item.positionAmt)) > 0
		);
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

	let totalRatio = 0;
	// let w_Position = 0;
	// let t_Position = 0;
	// if (holding && holding.length) {
	// 	holding.forEach((item) => {
	// 		const {
	// 			leverage,
	// 			entryPrice: avg_cost,
	// 			positionAmt,
	// 			positionSide,
	// 		} = item;
	// 		if (
	// 			Math.abs(Number(positionAmt)) > 0 &&
	// 			positionAmt &&
	// 			positionSide
	// 		) {
	// 			const current_mark_price = Number(mark_price);
	// 			let ratio =
	// 				((Number(current_mark_price) - Number(avg_cost)) *
	// 					Number(leverage)) /
	// 				Number(current_mark_price);
	// 			if (positionSide.toUpperCase() == 'SHORT') ratio = -ratio;
	// 			w_Position +=
	// 				ratio * Math.abs(Number(positionAmt)) * current_mark_price;
	// 			t_Position +=
	// 				Math.abs(Number(positionAmt)) * current_mark_price;
	// 		}
	// 	});
	// 	if (w_Position && t_Position) totalRatio = w_Position / t_Position;
	// }

	const TOTALRATIO = totalRatio;
	const CLOSE_WIN_CONDITION = holding && TOTALRATIO > WIN_MAX;
	const CLOSE_LOSS_CONDITION = longRatio < LOSS_MAX && shortRatio < LOSS_MAX;

	const { isUpperReverse, isLowerReverse } = fnIsMacdReverse(macdList);

	const MAIN_OPEN_LONG_CONDITION1 = !longHolding && isLowerReverse;
	const MAIN_OPEN_SHORT_CONDITION1 = !shortHolding && isUpperReverse;

	const MAIN_CLOSE_LONG_CONDITION1 =
		longHolding &&
		(longRatio < LOSS_MAX || longRatio > WIN_MAX || isUpperReverse);
	const MAIN_CLOSE_SHORT_CONDITION1 =
		shortHolding &&
		(shortRatio < LOSS_MAX || shortRatio > WIN_MAX || isLowerReverse);

	const MAIN_CLOSE_ALL_CONDITION =
		false && (CLOSE_WIN_CONDITION || CLOSE_LOSS_CONDITION);

	let openLongCondition = MAIN_OPEN_LONG_CONDITION1;
	let openShortCondition = MAIN_OPEN_SHORT_CONDITION1;
	let closeLongCondition = MAIN_CLOSE_LONG_CONDITION1;
	let closeShortCondition = MAIN_CLOSE_SHORT_CONDITION1;

	let isMarketDeal = true;
	let dealRatio = 0.01;

	const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
	const hmsArr = currentTime.split(' ')[1].split(':');
	const lastMinuteCharacter = hmsArr[1];
	const lastSecondCharacter = hmsArr[2];

	const isFiveM = true;

	console.log('************************************', currentTime);
	console.log(
		'symbol',
		symbol,
		'longRatio',
		longRatio,
		'shortRatio',
		shortRatio,
		// 'totalRatio',
		// totalRatio,
		'isUpperReverse',
		isUpperReverse,
		'isLowerReverse',
		isLowerReverse,
		'ATR',
		atrList[atrList.length - 1]
		// 'winMax',
		// WIN_MAX
	);
	// console.log(
	// 	'macd',
	// 	macdList.slice(-4).map(({ column, open, close, time }) => ({
	// 		column,
	// 		open,
	// 		close,
	// 		time,
	// 	}))
	// );
	// console.log('w_Position', w_Position, 't_Position', t_Position);
	console.log('************************************');

	const patchPosition = async (holding, direction) => {
		let positionAmt = Number(holding.positionAmt) * 2;
		await openPosition({
			position: positionAmt,
			openSide: direction,
			mark_price,
		});
	};

	const closeAllPosition = async () => {
		const pList = [];
		holding.forEach((item) => {
			pList.push(closePosition(item));
		});
		await Promise.all(pList);
	};

	if (MAIN_CLOSE_ALL_CONDITION) closeAllPosition();

	const closeLongPosition = async () => {
		if (longHolding && Math.abs(Number(longHolding.positionAmt))) {
			if (longRatio < LOSS_MAX && false) {
				await patchPosition(longHolding, 'long');
			} else if (longRatio > WIN_MAX || longRatio < LOSS_MAX || true) {
				let closePositionAmt = Math.abs(
					Number(longHolding.positionAmt)
				);
				const payload = {
					positionAmt: longHolding.positionAmt,
					position: closePositionAmt,
					side: 'long',
					positionSide: 'long',
					mark_price,
					ratio: longRatio,
					symbol: longHolding.symbol,
				};
				await closePosition(payload, false, avail);
			}
		}
	};

	const closeShortPosition = async () => {
		if (shortHolding && Math.abs(Number(shortHolding.positionAmt))) {
			if (shortRatio < LOSS_MAX && false) {
				await patchPosition(shortHolding, 'long');
			} else if (shortRatio > WIN_MAX || shortRatio < LOSS_MAX || true) {
				let closePositionAmt = Math.abs(
					Number(shortHolding.positionAmt)
				);
				const payload = {
					positionAmt: shortHolding.positionAmt,
					position: closePositionAmt,
					side: 'short',
					positionSide: 'short',
					mark_price,
					ratio: shortRatio,
					symbol: shortHolding.symbol,
				};
				await closePosition(payload, false, avail);
			}
		}
	};

	//平多仓条件
	if (closeLongCondition && isFiveM) {
		try {
			await closeLongPosition();
		} catch (e) {
			console.log(e);
		}
	}

	//平空仓条件
	if (closeShortCondition && isFiveM) {
		try {
			await closeShortPosition();
		} catch (e) {
			console.log(e);
		}
	}

	//开多仓条件
	if (openLongCondition) {
		try {
			let openPositionAmt = Number(
				((INIT_ASSETS * LEVERAGE) / mark_price).toFixed(
					quantityFixedMap[symbol]
				)
			);
			if (isFiveM /* && avail >= openPositionAmt */) {
				await openPosition(
					{
						position: openPositionAmt,
						openSide: 'long',
						mark_price,
						symbol,
					},
					atrList
				);
			}
		} catch (e) {
			console.log(e);
		}
	}

	//开空仓条件
	if (openShortCondition) {
		try {
			let openPositionAmt = Number(
				((INIT_ASSETS * LEVERAGE) / mark_price).toFixed(
					quantityFixedMap[symbol]
				)
			);

			if (isFiveM /* && avail >= openPositionAmt */) {
				await openPosition(
					{
						position: openPositionAmt,
						openSide: 'short',
						mark_price,
						symbol,
					},
					atrList
				);
			}
		} catch (e) {
			console.log(e);
		}
	}

	// if (longHolding && shortHolding) {
	// 	await waitTime(1000 * 1);
	// 	if (holding.length === 2) {
	// 		await fnTwoHoldingHandler(
	// 			longHolding,
	// 			shortHolding,
	// 			longRatio,
	// 			shortRatio
	// 		);
	// 	} else if (holding.length === 3) {
	// 		await fnThirdHoldingHandler(
	// 			holding,
	// 			longHolding,
	// 			longRatio,
	// 			shortRatio,
	// 			eth_mark_price
	// 		);
	// 	}
	// 	console.log;
	// 	console.log('holdingLength', holding.length);
	// 	console.log('*********************');
	// }
}
const fnTwoHoldingHandler = async (
	longHolding,
	shortHolding,
	longRatio,
	shortRatio
) => {
	const btcBasicPositionAmt = Number(
		Math.abs(
			Number(longHolding.positionAmt) / INIT_LONG_SHORT_ASSETS_RATIO
		).toFixed(3)
	);
	const ethBasicPositionAmt = Number(
		Math.abs(Number(shortHolding.positionAmt)).toFixed(3)
	);
	const offsetRatio = Math.abs(shortRatio) - Math.abs(longRatio);
	if (offsetRatio > MAX_OFFSET_RATIO && shortRatio < 0) {
		const openPositionAmt = ethBasicPositionAmt;
		const payload = {
			positionAmt: openPositionAmt,
			position: openPositionAmt,
			side: 'long',
			openSide: 'long',
			symbol: ETH_SYMBOL,
		};
		await openPosition(payload);

		// const closePositionAmt = btcBasicPositionAmt;
		// const closePayload = {
		// 	positionAmt: closePositionAmt,
		// 	position: closePositionAmt,
		// 	side: 'long',
		// 	positionSide: 'long',
		// 	symbol: BTC_SYMBOL,
		// };
		// await closePosition(closePayload);
	}
};

const fnThirdHoldingHandler = async (
	holding,
	longHolding,
	longRatio,
	shortRatio,
	eth_mark_price
) => {
	const btcBasicPositionAmt = Number(
		Math.abs(Number(longHolding.positionAmt)).toFixed(3)
	);
	const ethHoldingList = holding.filter(
		(item) =>
			item.symbol === ETH_SYMBOL && Math.abs(Number(item.positionAmt)) > 0
	);
	const ethLongHolding = ethHoldingList.find(
		(item) => item.positionSide.toUpperCase() == 'LONG'
	);
	const { leverage, entryPrice: avg_cost } = ethLongHolding;
	const ethLongRatio =
		((Number(eth_mark_price) - Number(avg_cost)) * Number(leverage)) /
		Number(eth_mark_price);

	const offsetRatio = Math.abs(shortRatio) - Math.abs(longRatio);
	if (offsetRatio < 0 || ethLongRatio < -MAX_OFFSET_RATIO) {
		// const openPositionAmt = btcBasicPositionAmt;
		// const openPayload = {
		// 	positionAmt: openPositionAmt,
		// 	position: openPositionAmt,
		// 	side: 'long',
		// 	openSide: 'long',
		// 	symbol: BTC_SYMBOL,
		// };
		// await openPosition(openPayload);

		const { positionAmt } = ethLongHolding;
		const closePositionAmt = Number(
			Math.abs(Number(positionAmt)).toFixed(3)
		);
		const payload = {
			positionAmt: closePositionAmt,
			position: closePositionAmt,
			side: 'long',
			positionSide: 'long',
			symbol: ETH_SYMBOL,
		};
		await closePosition(payload);
	}
};

const checkDeal = async (oldData, symbol) => {
	const data = cloneDeep(oldData);
	return await checkByStep(
		{
			macdList: data.macdList.slice(-80),
			rsiList: data.rsiList.slice(-80),
			bollList: data.bollList.slice(-80),
			atrList: data.atrList.slice(-80),
		},
		symbol
	);
};

const cancelReduceOnly = async (direction) => {
	let isHasReduceOnly = false;
	const result = await cAuthClientBN.swap.openOrders();
	if (result && result.length) {
		const index = result.findIndex(
			(item) => item.positionSide == direction && item.reduceOnly
		);
		if (index != -1) isHasReduceOnly = true;
	}
	if (isHasReduceOnly) {
		const time = 1000 * 2;
		await countdownCancelAll(time);
	}
};

var configBN = require('./configBN2');
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
	const newList = JSON.parse(JSON.stringify(list));
	let macdList = [];
	newList.map((item, index) => {
		let result = {};
		if (index == 0) {
			result = last || {
				ema5: Number(item[4]),
				ema10: Number(item[4]),
				ema20: Number(item[4]),
				ema60: Number(item[4]),
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
				lastEma5: lastResult.ema5,
				lastEma10: lastResult.ema10,
				lastEma20: lastResult.ema20,
				lastEma60: lastResult.ema60,
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

function getCurrentRSI(list) {
	const newList = JSON.parse(JSON.stringify(list));
	let rsiList = [];
	function* gen() {
		for (let i = 0; i < Math.min(newList.length, 400); i++) {
			if (i > 0) list.pop();
			const result = getRSI(
				Number(list[list.length - 1][0]),
				Number(list[list.length - 1][4]),
				list.map((item) => Number(item[4]))
			);
			rsiList.push(result);
			yield i;
		}
	}

	for (let k of gen()) {
		if (k >= Math.min(newList.length, 400)) break;
	}

	rsiList = rsiList.reverse();
	// rsiList = rsiList.slice(-2)
	return rsiList;
}

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

function getUUID() {
	function S4() {
		// eslint-disable-next-line no-bitwise
		return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
	}
	return `${S4() + S4()}${S4()}${S4()}${S4()}${S4()}${S4()}${S4()}`;
}

const queryLatestOpenOrders = async () => {
	const params = { symbol: BTC_SYMBOL, limit: 30 };
	const orders = await cAuthClientBN.swap.allOrders(params);
	orders.reverse();
	console.log(orders, orders.length);
	const latestLongOrder = orders.find(
		(item) =>
			item.positionSide == 'LONG' &&
			!item.reduceOnly &&
			Number(item.executedQty)
	);
	const latestShortOrder = orders.find(
		(item) =>
			item.positionSide == 'SHORT' &&
			!item.reduceOnly &&
			Number(item.executedQty)
	);

	return [latestLongOrder, latestShortOrder];

	// const latestOpenOrder = orders.find(
	//   (item) => !item.reduceOnly && Number(item.executedQty)
	// );
};

let openOrigClientOrderId = '';
let closeOrigClientOrderId = '';
const closeLimitPosition = async (params) => {
	let { position = INIT_POSITION, positionSide, symbol, price } = params;
	const type = positionSide.toUpperCase() === 'LONG' ? 'SELL' : 'BUY';
	console.log(
		'closeLimitOrderMoment',
		positionSide,
		moment().format('YYYY-MM-DD HH:mm:ss')
	);
	console.log('position', position, 'type', type, 'side', positionSide);

	const newSize = Math.abs(
		Number(position.toFixed(quantityFixedMap[symbol]))
	);
	const newPrice = price.toFixed(priceFixedMap[symbol]);
	const newClientOrderId = getUUID();
	closeOrigClientOrderId = newClientOrderId;

	const payload = {
		symbol,
		side: type,
		positionSide: positionSide.toUpperCase() === 'LONG' ? 'LONG' : 'SHORT',
		quantity: newSize,
		recvWindow: 5000,
		type: 'LIMIT',
		timeInForce: 'GTC',
		price: newPrice,
	};
	let result;
	try {
		result = await cAuthClientBN.swap.postOrder(payload);
		positionChange = true;

		console.log('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
		console.log(payload);
		// closeOrigClientOrderId = result.clientOrderId;
		console.log('closeOrigClientOrderId', closeOrigClientOrderId);
		console.log('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
	} catch (e) {
		// throw new Error('Error');
		restart('close');
	}
	console.log('###################################');
	console.log('closePositionMoment', moment().format('YYYY-MM-DD HH:mm:ss'));
	console.log('###################################');
	return result;
};
const openPosition = async (params = {}, atrList) => {
	const isMarketDeal = true;
	const dealRatio = 0.01;
	const { openSide = 'long', position, mark_price, symbol } = params;

	async function postOrder(size) {
		const type = openSide == 'long' ? 'BUY' : 'SELL';

		let price = mark_price;
		if (openSide == 'long') {
			price = mark_price * (1 - dealRatio / LEVERAGE);
		} else {
			price = mark_price * (1 + dealRatio / LEVERAGE);
		}
		const payload = {
			symbol,
			side: type,
			positionSide: openSide == 'long' ? 'LONG' : 'SHORT',
			quantity: Math.abs(size),
			recvWindow: 5000,
			type: 'MARKET',
		};
		console.log(
			'openOtherOrderMoment',
			openSide,
			symbol,
			'INIT_ASSETS',
			INIT_ASSETS,
			moment().format('YYYY-MM-DD HH:mm:ss')
		);
		console.log('payload', payload);
		try {
			const result = await cAuthClientBN.swap.postOrder(payload);
			positionChange = true;

			openOrigClientOrderId = result.clientOrderId;
		} catch (e) {
			// throw new Error('Error');
			restart('open');
		}
	}
	await postOrder(position, mark_price);
	// await writeData();
	setTimeout(async () => {
		await fnCloseLimitOrder(params, atrList);
	}, 1000 * 3);
};

const fnCloseLimitOrder = async (params, atrList) => {
	const { openSide = 'long', position, mark_price, symbol } = params;
	const ATR = atrList[atrList.length - 1] * ATR_WIN_RATIO;
	const isLong = openSide.toUpperCase() == 'LONG';
	const price = isLong ? mark_price + ATR : mark_price - ATR;
	const side = isLong ? 'SELL' : 'BUY';
	const positionSide = isLong ? 'LONG' : 'SHORT';
	const payload = {
		price,
		symbol,
		side,
		positionSide,
		position,
	};
	await closeLimitPosition(payload);
};

const closePosition = async (holding, isCloseAll = false, avail) => {
	let { position = INIT_POSITION, positionSide, symbol } = holding;
	position = Math.abs(Number(holding.positionAmt));

	async function postOrder(size) {
		const newClientOrderId = getUUID();
		closeOrigClientOrderId = newClientOrderId;

		const type = positionSide.toUpperCase() == 'LONG' ? 'SELL' : 'BUY';

		const payload = {
			symbol,
			side: type,
			positionSide:
				positionSide.toUpperCase() == 'LONG' ? 'LONG' : 'SHORT',
			quantity: Math.abs(size),
			recvWindow: 5000,
			type: 'MARKET',
		};
		try {
			const result = await cAuthClientBN.swap.postOrder(payload);
			positionChange = true;

			console.log('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
			closeOrigClientOrderId = result.clientOrderId;
			console.log('closeOrigClientOrderId', closeOrigClientOrderId);
			console.log(symbol),
				console.log('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
		} catch (e) {
			// throw new Error('Error');
			restart('close');
		}
	}
	console.log('###################################');
	console.log('closePositionMoment', moment().format('YYYY-MM-DD HH:mm:ss'));
	console.log('###################################');
	countdownCancelAll(symbol);
	return await postOrder(position);
};

let positionChange = true;
let globalHolding = null;
/*
ATR = ((n-1) * ATR’ + TR) / n

ATR’表示昨天的ATR，TR表示今天的真实波动幅度，n表示计算的时间周期，通常为14。

真实波动幅度（TR）的计算公式如下：

TR = max(max(H – L, abs(H – C’)), abs(L – C’))

H表示今天的最高价，L表示今天的最低价，C’表示昨天的收盘价。
*/
function getATR(item, i, lastATR, period) {
	const open = Number(item[1]);
	const high = Number(item[2]);
	const low = Number(item[3]);
	const TR = Math.max(
		Math.max(high - low, Math.abs(high - open)),
		Math.abs(low - open)
	);
	let ATR = TR;
	if (i > 0) {
		// ATR = (period - 1) * getATR(list, i - 1, period) + TR;
		ATR = ((period - 1) * lastATR + TR) / period;
	}
	return ATR;
}

function getATRByPeriod(list, period = 13) {
	const newList = JSON.parse(JSON.stringify(list));
	const atrList = [];
	newList.forEach((item, index) => {
		const ATR = getATR(item, index, atrList[index - 1], period);
		atrList.push(ATR);
	});
	return atrList;
}

function getMacd(params) {
	const {
		close: price,
		lastEma5,
		lastEma10,
		lastEma20,
		lastEma60,
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

	const p1 = 13;
	const p2 = 34;
	const p3 = 5;

	const ema5 = toFixedAndToNumber(
		(2 / (5 + 1)) * price + (4 / (5 + 1)) * lastEma5,
		4
	);
	const ema10 = toFixedAndToNumber(
		(2 / (10 + 1)) * price + (9 / (10 + 1)) * lastEma10,
		4
	);
	const ema20 = toFixedAndToNumber(
		(2 / (20 + 1)) * price + (19 / (20 + 1)) * lastEma20,
		4
	);
	const ema60 = toFixedAndToNumber(
		(2 / (59 + 1)) * price + (59 / (60 + 1)) * lastEma60,
		4
	);

	const ema12 = toFixedAndToNumber(
		(2 / (p1 + 1)) * price + ((p1 - 1) / (p1 + 1)) * lastEma12,
		8
	);
	const ema26 = toFixedAndToNumber(
		(2 / (p2 + 1)) * price + ((p2 - 1) / (p2 + 1)) * lastEma26,
		8
	);

	const diff = toFixedAndToNumber(ema12 - ema26, 8);
	const dea = toFixedAndToNumber(
		(2 / (p3 + 1)) * diff + ((p3 - 1) / (p3 + 1)) * lastDea,
		8
	);

	const column = toFixedAndToNumber(2 * (diff - dea), 8);

	const result = {
		open,
		close: price,
		ema5,
		ema10,
		ema20,
		ema60,
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
	return Math.round(n * Math.pow(10, num)) / Math.pow(10, num);
}
function getRSIAverage(list, i, n) {
	let diff;
	let gainI = 0;
	let lossI = 0;
	if (i == 0) {
		diff = 0;
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
	} else if (i == 1 || i == 2) {
		gainAverageI = 100;
		lossAverageI = 100;
	} else {
		const lastRSIAverage = getRSIAverage(list, i - 1, n);
		gainAverageI = (gainI + (n - 1) * lastRSIAverage.gainAverageI) / n;
		lossAverageI = (lossI + (n - 1) * lastRSIAverage.lossAverageI) / n;
	}
	return {
		gainAverageI,
		lossAverageI,
	};
}
function getRSIByPeriod(newList, period) {
	const result = getRSIAverage(newList, newList.length - 1, period);
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
function getRSI(time, price, list) {
	const { RSI: RSI1 } = getRSIByPeriod(list, rsi1);
	const { RSI: RSI2 } = getRSIByPeriod(list, rsi2);
	const { RSI: RSI3 } = getRSIByPeriod(list, rsi3);

	const result = {
		time: moment(parseInt(time)).format('YYYY-MM-DD HH:mm:ss'),
		price,
		RSI1,
		RSI2,
		RSI3,
	};
	return result;
}

function getAverage(list) {
	let sum = 0;
	for (let i = 0; i < list.length; i++) {
		sum += list[i];
	}
	let mean = sum / list.length;
	return mean;
}

const waitTime = (time = 1000 * 4) => {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(true);
		}, time);
	});
};

const countdownCancelAll = async (symbol, time = 1000 * 2) => {
	const payload = {
		symbol,
		countdownTime: time,
	};
	await cAuthClientBN.swap.countdownCancelAll(payload);
};

const fnGetSymbolResult = async (symbol, payload) => {
	const list = await cAuthClientBN.common.getHistory(symbol, payload);
	const newList = JSON.parse(JSON.stringify(list));
	newList.pop();

	const bollList = getCurrentBOLL(newList);
	const macdList = getCurrentMacd(newList);
	// const rsiList = getCurrentRSI(newList);
	const atrList = getATRByPeriod(newList);

	const result = {
		macdList,
		bollList,
		rsiList: [],
		atrList,
	};

	return result;
};

const startInterval = async () => {
	RESTART_TIME += 1;
	if (RESTART_TIME >= 1 * 14) {
		RESTART_TIME = 0;
		restart('normal');
		return;
	}
	try {
		const time = moment().valueOf();
		const payload = {
			interval: DEFAULT_INTERVAL,
			limit: 100,
			endTime: time,
		};

		const btc_result = await fnGetSymbolResult(BTC_SYMBOL, payload);
		const eth_result = await fnGetSymbolResult(ETH_SYMBOL, payload);
		const eos_result = await fnGetSymbolResult(EOS_SYMBOL, payload);
		const xrp_result = await fnGetSymbolResult(XRP_SYMBOL, payload);
		const doge_result = await fnGetSymbolResult(DOGE_SYMBOL, payload);

		await checkDeal(btc_result, BTC_SYMBOL);
		await checkDeal(eth_result, ETH_SYMBOL);
		await checkDeal(eos_result, EOS_SYMBOL);
		await checkDeal(xrp_result, XRP_SYMBOL);
		await checkDeal(doge_result, DOGE_SYMBOL);

		await waitTime((1000 * 56) / 2);
		await startInterval();
	} catch (e) {
		restart(e);
	}
};

const readData = async () => {
	let dataConfig = JSON.parse(fs.readFileSync('./app/config.json', 'utf-8'));
	MODE = dataConfig.MODE;

	console.log('read::MODE', MODE, moment().format('YYYY-MM-DD HH:mm:ss'));
};

const writeData = async () => {
	//将修改后的配置写入文件前需要先转成json字符串格式
	let dataConfig = {
		MODE: String(MODE),
	};
	let jsonStr = JSON.stringify(dataConfig);

	const result = await new Promise((resolve) => {
		//将修改后的内容写入文件
		fs.writeFile('./app/config.json', jsonStr, function (err) {
			if (err) {
				console.error(err);
			} else {
				console.log('----------修改成功-------------');
				resolve(true);
			}
		});
	});

	return result;
};

// 定时获取交割合约账户信息
(async () => {
	// await readData();
	await startInterval();
})();
app.listen(8093);

console.log('8093 server start');

process.on('uncaughtException', function (e) {
	//打印出错误
	restart(e);
});

let exec = require('child_process').exec;
function restart(e) {
	console.log('restarting......', e);
	setTimeout(() => {
		exec('npm run restart', function (err, stdout, stderr) {
			if (err) {
				console.log('restarting failed');
			} else {
				console.log('restarting success');
			}
		});
	}, 1000 * 2);
}
function start() {
	console.log('starting......');
	setTimeout(() => {
		exec('npm run start', function (err, stdout, stderr) {
			if (err) {
				console.log('starting failed');
			} else {
				console.log('starting success');
			}
		});
	}, 1000 * 2);
}
function stop() {
	console.log('stopping......');
	setTimeout(() => {
		exec('npm run stop', function (err, stdout, stderr) {
			if (err) {
				console.log('stopping failed');
			} else {
				console.log('stopping success');
			}
			setTimeout(() => {
				start();
			}, 1000 * 60 * 60 * 24 * 1);
		});
	}, 1000 * 2);
}
