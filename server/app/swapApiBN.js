import moment from 'moment';
const fs = require('fs');

const customAuthClientBN = require('./customAuthClientBN');

const BN_SYMBOL = 'BTCUSDT';
const DEFAULT_INTERVAL = '1h';
const INIT_POSITION = 0.15;
const MAX_OPEN_POSITION_RATIO = INIT_POSITION * 5;
let MODE = 1;

const generatePositionList = (init, num) => {
	const arr = [init];
	const holding = [init];
	let i = 0;
	while (i < num) {
		init = Number((init + init * 0.15).toFixed(2));
		arr.push(init);
		holding.push(holding[i] + init);
		i++;
	}
	return [arr, holding];
};

const LONG_CONDITION = 50;
const SHORT_CONDITION = 50;
const LEVERAGE = 10;
const BAO_RATIO = -0.95;
const LOSS_MAX = ((-0.1 / 1.9) * LEVERAGE) / 10;
const WIN_MAX = (0.1 * 3 * LEVERAGE) / 10;
const CAPITAL_RATIO = 1;
const fiList = [1, 2, 4, 8, 16, 24];

const ORIGIN_INIT_POSITION = INIT_POSITION;
const generate_position = generatePositionList(ORIGIN_INIT_POSITION, 20);
const INCREASE_FI_LIST = generate_position[0];
const INCREASE_FI_LIST_HOLDING = generate_position[1];

const POSITION_RATIO = 10;
let RESTART_TIME = 0;

let rsi1 = 8;
let rsi2 = 12;
let rsi3 = 24;

const INIT_MOST_LOSS = {
	profit: 0,
	time: null,
};
let mostLoss = INIT_MOST_LOSS;
let maxWinRatio = 0;

const checkDeal = async (data) => {
	await checkByStep({
		macdList: data.macdList.slice(-80),
		rsiList: data.rsiList.slice(-80),
		bollList: data.bollList.slice(-80),
	});

	async function checkByStep(data, isForceDeal) {
		const { macdList, rsiList, bollList } = data;
		let mark_price;
		try {
			const data = await cAuthClientBN.common.getMarkPrice(BN_SYMBOL);
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
				// MODE = 1;
				avail = (availableBalance * LEVERAGE) / mark_price;

				console.log('------------------');
				console.log(
					`availableBalance`,
					availableBalance,
					'avail',
					avail,
					'INIT_POSITION',
					INIT_POSITION
				);
				console.log('------------------');
			} catch (e) {
				// if(result.error_message) throw new Error('Cannot get position!');
				restart('getPosition');
			}
		}

		let holding = globalHolding;
		if (holding && holding.length) {
			longHolding = holding.find(
				(item) =>
					item.symbol === BN_SYMBOL &&
					item.positionSide &&
					item.positionSide.toUpperCase() == 'LONG' &&
					Math.abs(Number(item.positionAmt)) > 0
			);
			shortHolding = holding.find(
				(item) =>
					item.symbol === BN_SYMBOL &&
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

		const CENTER_CROSS_LONG_CONDITION =
			Number(macdList[macdList.length - 2].close) <
				Number(bollList[bollList.length - 2].MA) &&
			Number(macdList[macdList.length - 1].close) >
				Number(bollList[bollList.length - 1].MA) &&
			Number(macdList[macdList.length - 1].close) <
				Number(bollList[bollList.length - 1].UP);

		const CENTER_CROSS_SHORT_CONDITION =
			Number(macdList[macdList.length - 2].close) >
				Number(bollList[bollList.length - 2].MA) &&
			Number(macdList[macdList.length - 1].close) <
				Number(bollList[bollList.length - 1].MA) &&
			Number(macdList[macdList.length - 1].close) >
				Number(bollList[bollList.length - 1].DN);

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

		// const result = await queryLatestOpenOrders();
		// const [latestLongOrder, latestShortOrder] = result;

		// const isLatestLongWin = latestLongOrder
		//   ? Number(mark_price) > Math.abs(Number(latestLongOrder.avgPrice))
		//   : true;
		// const isLatestShortWin = latestShortOrder
		//   ? Number(mark_price) < Math.abs(Number(latestShortOrder.avgPrice))
		//   : true;

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
			CONVERSE_LOW_CONDITION;

		const BATCH_SHORT_CLOSE_CONDITION =
			longHolding &&
			shortHolding &&
			Math.abs(longHolding.positionAmt) >
				INIT_POSITION * MAX_OPEN_POSITION_RATIO &&
			Math.abs(shortHolding.positionAmt) >
				INIT_POSITION * MAX_OPEN_POSITION_RATIO &&
			CONVERSE_UP_CONDITION;

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

		const PRICE_LOW_MA =
			Number(macdList[macdList.length - 1].close) <
			Number(bollList[bollList.length - 1].MA);
		const PRICE_UP_MA =
			Number(macdList[macdList.length - 1].close) >
			Number(bollList[bollList.length - 1].MA);

		const CLOSE_ALL_LONG_CONDITION = false;
		const CLOSE_ALL_SHORT_CONDITION = false;

		const MAIN_OPEN_LONG_CONDITION1 =
			!longHolding &&
			(OUT_LOW_CONDITION ||
				(shortHolding && CONVERSE_UP_CONDITION) ||
				(!shortHolding && CENTER_CROSS_LONG_CONDITION));
		const MAIN_OPEN_SHORT_CONDITION1 =
			!shortHolding &&
			(OUT_HIGH_CONDITION ||
				(longHolding && CONVERSE_LOW_CONDITION) ||
				(!longHolding && CENTER_CROSS_SHORT_CONDITION));

		const MAIN_CLOSE_LONG_CONDITION1 =
			longHolding &&
			((!shortHolding && OUT_HIGH_CONDITION) ||
				(shortHolding &&
					(CENTER_CROSS_SHORT_CONDITION || OUT_LOW_CONDITION)));
		const MAIN_CLOSE_SHORT_CONDITION1 =
			shortHolding &&
			((!longHolding && OUT_LOW_CONDITION) ||
				(longHolding &&
					(CENTER_CROSS_LONG_CONDITION || OUT_HIGH_CONDITION)));

		const MAIN_OPEN_LONG_CONDITION2 =
			!longHolding && CENTER_CROSS_SHORT_CONDITION;
		const MAIN_OPEN_SHORT_CONDITION2 =
			!shortHolding && CENTER_CROSS_LONG_CONDITION;
		const MAIN_CLOSE_LONG_CONDITION2 =
			longHolding && CENTER_CROSS_LONG_CONDITION;
		const MAIN_CLOSE_SHORT_CONDITION2 =
			shortHolding && CENTER_CROSS_SHORT_CONDITION;

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

		// if (longHolding || shortHolding) NEW_POSITION_RATIO = 2;
		// if (CLOSE_CONDITION) NEW_POSITION_RATIO = 1;

		// NEW_POSITION_RATIO =
		//   35 /
		//   (Number(bollList[bollList.length - 1].UP) -
		//     Number(bollList[bollList.length - 1].DN));

		// IS_CLOSE_ALL_POSITION = false;
		// if (openLongCondition || openShortCondition) {
		//   if (
		//     (longHolding &&
		//       Math.abs(Number(longHolding.positionAmt)) >=
		//         CLOSE_SAME_POSITION_RATIO) ||
		//     (shortHolding &&
		//       Math.abs(Number(shortHolding.positionAmt)) >=
		//         CLOSE_SAME_POSITION_RATIO)
		//   ) {
		//     IS_CLOSE_ALL_POSITION = true;
		//     closeLongCondition = true;
		//     closeShortCondition = true;
		//   }
		// }

		let isMarketDeal = true;
		let dealRatio = 0.01;

		const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
		const hmsArr = currentTime.split(' ')[1].split(':');
		const lastMinuteCharacter = hmsArr[1];
		const lastSecondCharacter = hmsArr[2];
		const minuteList = ['0', '00'];
		const secondList = ['0', '00'];
		const minuteDiff = moment(currentTime).diff(
			moment(macdList[macdList.length - 1].time),
			'minute'
		);
		const isFiveM =
			minuteDiff < 90 &&
			minuteList.includes(lastMinuteCharacter) &&
			!secondList.includes(lastSecondCharacter);

		// if (isFiveM && avail < INIT_POSITION * NEW_POSITION_RATIO) {
		//   if (openLongCondition) {
		//     openLongCondition = false;
		//     closeShortCondition = true;
		//   } else if (openShortCondition) {
		//     openShortCondition = false;
		//     closeLongCondition = true;
		//   }
		// }

		console.log('************************************', currentTime);
		console.log('isFiveM', isFiveM, lastMinuteCharacter);
		console.log('macdList', macdList.slice(-2));
		console.log('bollList', bollList.slice(-2));
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
			openShortCondition
		);
		console.log('************************************');

		const patchPosition = async (holding, direction) => {
			let positionAmt = Number(holding.positionAmt) * 2;
			await openPosition({
				position: positionAmt,
				openSide: direction,
				mark_price,
				time: macdList[macdList.length - 1].time,
			});
		};

		const closeLongPosition = async () => {
			if (longHolding && Math.abs(Number(longHolding.positionAmt))) {
				// const patchNum = getPowByNum(
				//   Math.abs(Number(longHolding.positionAmt)),
				//   INIT_POSITION
				// );
				if (longRatio < LOSS_MAX && false) {
					await patchPosition(longHolding, 'long');
				} else if (
					longRatio > WIN_MAX ||
					longRatio < LOSS_MAX ||
					true
				) {
					let closePositionAmt = INIT_POSITION;
					if (CLOSE_ALL_LONG_CONDITION)
						closePositionAmt = Math.abs(
							Number(longHolding.positionAmt)
						);
					// if (BATCH_LONG_CLOSE_CONDITION)
					//   closePositionAmt = Math.abs(Number(longHolding.positionAmt));
					// const curIndex = fiList.findIndex(
					//   (positionAmt) =>
					//     positionAmt == Math.abs(Number(longHolding.positionAmt))
					// );
					// if (curIndex) {
					//   closePositionAmt = fiList[curIndex - 1];
					// }
					// if (closePositionAmt > INIT_POSITION)
					//   closePositionAmt = Number(
					//     ((closePositionAmt / 2.15) * 1.15).toFixed(2)
					//   );

					const payload = {
						positionAmt: longHolding.positionAmt,
						position: closePositionAmt,
						side: 'long',
						mark_price,
						time: macdList[macdList.length - 1].time,
						ratio: longRatio,
					};
					await closePosition(payload, false, avail);
				}
			}
		};

		const closeShortPosition = async () => {
			if (shortHolding && Math.abs(Number(shortHolding.positionAmt))) {
				if (shortRatio < LOSS_MAX && false) {
					await patchPosition(shortHolding, 'long');
				} else if (
					shortRatio > WIN_MAX ||
					shortRatio < LOSS_MAX ||
					true
				) {
					let closePositionAmt = INIT_POSITION;
					if (CLOSE_ALL_SHORT_CONDITION)
						closePositionAmt = Math.abs(
							Number(shortHolding.positionAmt)
						);
					// if (BATCH_SHORT_CLOSE_CONDITION)
					//   closePositionAmt = Math.abs(Number(shortHolding.positionAmt));
					// const curIndex = fiList.findIndex(
					//   (positionAmt) =>
					//     positionAmt == Math.abs(Number(shortHolding.positionAmt))
					// );
					// if (curIndex) {
					//   closePositionAmt = fiList[curIndex - 1];
					// }
					// if (closePositionAmt > INIT_POSITION)
					//   closePositionAmt = Number(
					//     ((closePositionAmt / 2.15) * 1.15).toFixed(2)
					//   );
					const payload = {
						positionAmt: shortHolding.positionAmt,
						position: closePositionAmt,
						side: 'short',
						mark_price,
						time: macdList[macdList.length - 1].time,
						ratio: shortRatio,
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
				// let openPositionAmt = shortHolding
				//   ? Math.abs(shortHolding.positionAmt) +
				//     INIT_POSITION * NEW_POSITION_RATIO
				//   : INIT_POSITION;
				let openPositionAmt = INIT_POSITION;
				// if (BATCH_LONG_OPEN_CONDITION)
				//   openPositionAmt = INIT_POSITION * (MAX_OPEN_POSITION_RATIO + 1);
				// if (shortHolding && !closeShortCondition) {
				//   openPositionAmt = 2 * INIT_POSITION;
				// }
				// if (longHolding) {
				//   const curIndex = fiList.findIndex(
				//     (positionAmt) => positionAmt == Math.abs(longHolding.positionAmt)
				//   );
				//   openPositionAmt = fiList[curIndex];
				// }
				// openPositionAmt = Number(openPositionAmt.toFixed(2));
				// if (!longHolding) {
				//   if (shortHolding) {
				//     openPositionAmt = Math.abs(shortHolding.positionAmt);
				//   } else {
				//     openPositionAmt = INIT_POSITION * 4;
				//   }
				// }
				if (isFiveM /* && avail >= openPositionAmt */) {
					await openPosition(
						{
							position: openPositionAmt,
							openSide: 'long',
							mark_price,
							time: macdList[macdList.length - 1].time,
						},
						isMarketDeal,
						dealRatio
					);
				}
			} catch (e) {
				console.log(e);
			}
		}

		//开空仓条件
		if (openShortCondition) {
			try {
				// let openPositionAmt = shortHolding
				//   ? Math.abs(shortHolding.positionAmt) +
				//     INIT_POSITION * NEW_POSITION_RATIO
				//   : INIT_POSITION;
				let openPositionAmt = INIT_POSITION;
				// if (BATCH_SHORT_OPEN_CONDITION)
				//   openPositionAmt = INIT_POSITION * (MAX_OPEN_POSITION_RATIO + 1);
				// if (longHolding && !closeLongCondition) {
				//   openPositionAmt = 2 * INIT_POSITION;
				// }
				// if (shortHolding) {
				//   const curIndex = fiList.findIndex(
				//     (positionAmt) => positionAmt == Math.abs(shortHolding.positionAmt)
				//   );
				//   openPositionAmt = fiList[curIndex];
				// }
				// openPositionAmt = Number(openPositionAmt.toFixed(2));
				// if (!shortHolding) {
				//   if (longHolding) {
				//     openPositionAmt = Math.abs(longHolding.positionAmt);
				//   } else {
				//     openPositionAmt = INIT_POSITION * 4;
				//   }
				// }
				if (isFiveM /* && avail >= openPositionAmt */) {
					await openPosition(
						{
							position: openPositionAmt,
							openSide: 'short',
							mark_price,
							time: macdList[macdList.length - 1].time,
						},
						isMarketDeal,
						dealRatio
					);
				}
			} catch (e) {
				console.log(e);
			}
		}

		// if (
		//   (closeLongCondition && longRatio > WIN_MAX * 4) ||
		//   (closeShortCondition && shortRatio > WIN_MAX * 4)
		// ) {
		//   stop();
		// }
	}
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

function getCurrentMacd(list) {
	let macdList = [];
	list.map((item, index) => {
		let result = {};
		if (index == 0) {
			result = {
				open: Number(item[1]),
				price: Number(item[4]),
				close: Number(item[4]),
				ema12: Number(item[4]),
				ema26: Number(item[4]),
				ema60: Number(item[4]),
				diff: 0,
				dea: 0,
				column: 0,
				high: Number(item[2]),
				low: Number(item[3]),
				time: moment(parseInt(item[0])).format('YYYY-MM-DD HH:mm:ss'),
			};
		} else {
			const lastResult = macdList[macdList.length - 1];
			const payload = {
				open: Number(item[1]),
				price: Number(item[4]),
				close: Number(item[4]),
				lastEma12: lastResult.ema12,
				lastEma26: lastResult.ema26,
				lastEma60: lastResult.ema60,
				lastDea: lastResult.dea,
				high: Number(item[2]),
				low: Number(item[3]),
				time: moment(parseInt(item[0])).format('YYYY-MM-DD HH:mm:ss'),
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
	const params = { symbol: BN_SYMBOL, limit: 30 };
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
const openPosition = async (params = {}, isMarketDeal = false, dealRatio) => {
	isMarketDeal = true;
	const {
		openSide = 'long',
		position = Number(INIT_POSITION),
		mark_price,
	} = params;

	async function postOrder(size) {
		const type = openSide == 'long' ? 'BUY' : 'SELL';
		console.log(
			'openOtherOrderMoment',
			openSide,
			moment().format('YYYY-MM-DD HH:mm:ss')
		);
		console.log('position', position, 'type', type, 'side', openSide);

		let price = mark_price;
		if (openSide == 'long') {
			price = mark_price * (1 - dealRatio / LEVERAGE);
		} else {
			price = mark_price * (1 + dealRatio / LEVERAGE);
		}
		let payload = {
			symbol: BN_SYMBOL,
			side: type,
			positionSide: openSide == 'long' ? 'LONG' : 'SHORT',
			quantity: Math.abs(size),
			recvWindow: 5000,
			// type: "MARKET",
			type: 'LIMIT',
			timeInForce: 'GTC',
			price: price.toFixed(2),
		};
		if (MODE == 2 || isMarketDeal) {
			payload = {
				symbol: BN_SYMBOL,
				side: type,
				positionSide: openSide == 'long' ? 'LONG' : 'SHORT',
				quantity: Math.abs(size),
				recvWindow: 5000,
				type: 'MARKET',
			};
		}
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
};

const closePosition = async (holding, isCloseAll = false, avail) => {
	let { position = INIT_POSITION, side, mark_price, time, ratio } = holding;
	// position = isCloseAll ? Math.abs(Number(holding.positionAmt)) : INIT_POSITION;
	// position = Math.abs(Number(holding.positionAmt));
	// position = INIT_POSITION;
	// if (ratio > 0) position = Math.abs(Number(holding.positionAmt));

	// if (IS_CLOSE_ALL_POSITION) position = Math.abs(Number(holding.positionAmt));
	// if (avail < INIT_POSITION * NEW_POSITION_RATIO)
	//   position = INIT_POSITION * NEW_POSITION_RATIO;

	async function postOrder(size) {
		const newClientOrderId = getUUID();
		closeOrigClientOrderId = newClientOrderId;

		const type = side == 'long' ? 'SELL' : 'BUY';

		const payload = {
			symbol: BN_SYMBOL,
			side: type,
			positionSide: side == 'long' ? 'LONG' : 'SHORT',
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
			console.log('price', mark_price);
			console.log('$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$$');
		} catch (e) {
			// throw new Error('Error');
			restart('close');
		}
	}
	console.log('###################################');
	console.log('closePositionMoment', moment().format('YYYY-MM-DD HH:mm:ss'));
	console.log('###################################');
	await postOrder(position, mark_price);
};

let positionChange = true;
let globalHolding = null;
function getMacd(params) {
	const {
		open,
		close,
		price,
		lastEma12,
		lastEma26,
		lastEma60,
		lastDea,
		high,
		low,
		time,
	} = params;

	const ema12 = toFixedAndToNumber(
		(2 / (12 + 1)) * price + (11 / (12 + 1)) * lastEma12,
		4
	);
	const ema26 = toFixedAndToNumber(
		(2 / (26 + 1)) * price + (25 / (26 + 1)) * lastEma26,
		4
	);
	const ema60 = toFixedAndToNumber(
		(2 / (60 + 1)) * price + (59 / (60 + 1)) * lastEma26,
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
		close,
		price,
		ema12,
		ema26,
		ema60,
		diff,
		dea,
		column,
		high,
		low,
		time,
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

const countdownCancelAll = async (time) => {
	const payload = {
		symbol: BN_SYMBOL,
		countdownTime: time,
	};
	await cAuthClientBN.swap.countdownCancelAll(payload);
};

const startInterval = async () => {
	RESTART_TIME += 1;
	if (RESTART_TIME >= 1 * 14) {
		RESTART_TIME = 0;
		restart();
		return;
	}
	try {
		const time = moment().valueOf();
		const payload = {
			interval: DEFAULT_INTERVAL,
			limit: 100,
			endTime: time,
		};
		const data = await cAuthClientBN.common.getHistory(BN_SYMBOL, payload);
		const list = data;

		const newList = JSON.parse(JSON.stringify(list));
		newList.pop();
		const bollList = getCurrentBOLL(newList);
		const macdList = getCurrentMacd(newList);
		const rsiList = getCurrentRSI(newList);

		const result = {
			macdList,
			rsiList,
			bollList,
		};
		await checkDeal(result);

		await waitTime(1000 * 56);
		await startInterval();
	} catch (e) {
		restart();
	}
};

// const readData = async () => {
//   let dataConfig = JSON.parse(fs.readFileSync("./app/config.json", "utf-8"));
//   MODE = dataConfig.MODE;

//   console.log("read::MODE", MODE, moment().format("YYYY-MM-DD HH:mm:ss"));
// };

// const writeData = async () => {
//   //将修改后的配置写入文件前需要先转成json字符串格式
//   let dataConfig = {
//     MODE: String(MODE),
//   };
//   let jsonStr = JSON.stringify(dataConfig);

//   const result = await new Promise((resolve) => {
//     //将修改后的内容写入文件
//     fs.writeFile("./app/config.json", jsonStr, function (err) {
//       if (err) {
//         console.error(err);
//       } else {
//         console.log("----------修改成功-------------");
//         resolve(true);
//       }
//     });
//   });

//   return result;
// };

// 定时获取交割合约账户信息
(async () => {
	await startInterval();
})();
app.listen(8093);

console.log('8093 server start');

process.on('uncaughtException', function (err) {
	//打印出错误
	// console.log('uncaughtException',err);
	restart();
});

let exec = require('child_process').exec;
function restart() {
	console.log('restarting......');
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
