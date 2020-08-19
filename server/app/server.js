// var EventEmitter = require('events').EventEmitter;
const { PublicClient } = require('@okfe/okex-node');
// const { V3WebsocketClient } = require('@okfe/okex-node');
const { AuthenticatedClient } = require('@okfe/okex-node');

var config  = require('./config');
const pClient = new PublicClient(config.urlHost);
const authClient = new AuthenticatedClient(config.httpkey,
    config.httpsecret, config.passphrase, config.urlHost);

// const wss= new V3WebsocketClient(config.websocekHost);

// const event = new EventEmitter();
const sample_instrument_id = 'BTC-USDT';
var channel_id = 'swap/depth5:BTC-USD-SWAP';
var instrument_id = "btc-usdt";
var currency = 'btc';

var loginState = false;
var pendingOrders = [];
var dealOrders = [];
var hasPending = false;

var futures_instrument_id = "BTC-USD-200828";

var ett_currency = "ok06ett";

//websocket 初始化
console.log('spot.......');
// wss.connect();
// wss.on('open', data=>{
//     console.log("websocket open!!!");
//     wss.login(config.wskey, config.wssecret, config.passphrase);
//     wss.subscribe('swap/depth:BTC-USD-SWAP');
//
// });
// wss.on('message', wsMessage);
// event.on('login',data =>{
//
//     (async function(){
//         //wss.subscribe('swap/account:BTC-USD-SWAP');
//         //wss.unsubscribe('swap/position:BTC-USD-SWAP');
//     }())
// })

/*************************** ETT test examples ******************************/
//验证通过
authClient.ett().getAccounts(ett_currency).then(res => console.log(JSON.stringify(res)));
pClient.ett().getConstituents(ett_currency).then(res => console.log(JSON.stringify(res)));



/*************************** futures test examples ******************************/
//验证通过
pClient.futures().getInstruments().then(res => console.log(JSON.stringify(res)));
authClient.futures().getPosition(futures_instrument_id).then(res => console.log(JSON.stringify(res)));

/*************************** spot api test **********************************/
//验证通过
// authClient.spot().getAccounts(currency).then(res => console.log(JSON.stringify(res)));

/*************************** wallet test examples ******************************/
//验证通过
//authClient.account().getCurrencies().then(res => console.log(JSON.stringify(res)));


//websocket 返回消息
// function wsMessage(data){
//     console.log(`!!! websocket message =${data}`);
//     var obj = JSON.parse(data);
//     var eventType = obj.event;
//     if(eventType == 'login'){
//         //登录消息
//         if(obj.success == true){
//             event.emit('login');
//         }
//     }else if(eventType == undefined){
//         //行情消息相关
//         tableMsg(obj);
//     }
// }

function tableMsg(marketData){
    var tableType = marketData.table;
    if(tableType != undefined){
        //行情数据
        var asks = marketData.data[0].asks;
        var bids = marketData.data[0].bids;
    }
}
