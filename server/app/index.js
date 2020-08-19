const { PublicClient } = require('@okfe/okex-node');
const { AuthenticatedClient } = require('@okfe/okex-node');

var config  = require('./config');
const pClient = new PublicClient(config.urlHost);
const authClient = new AuthenticatedClient(config.httpkey,
    config.httpsecret, config.passphrase, config.urlHost);

var express = require('express');
// var http = require('../utils/http');
var app = express();

function send (res, ret) {
    var str = JSON.stringify(ret)
    res.send(str)
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
    send(res, { errcode: 0, errmsg: 'ok' })
});

app.get('/account/getCurrencies', function(req, response) {
    authClient.account().getCurrencies().then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.get('/account/getWallet', function(req, response) {
    const { query = {} } = req;
    const currency = query.params || query;
    authClient.account().getWallet(currency).then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.get('/futures/getOrders', function(req, response) {
    const { query = {} } = req;
    const instrument_id = query.params || query; // "BTC-USD-200828"
    console.log(req,instrument_id)
    authClient.futures().getOrders("BTC-USD-200828").then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});


app.listen(80);

console.log('server start');
