
import request from '../utils/request';

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
    const { currency } = query.params || query;
    authClient.account().getWallet(currency).then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.get('/futures/getOrders', function(req, response) {
    const { query = {} } = req;
    const { instrument_id } = query; // "BTC-USD-200821"
    authClient.futures().getOrders(instrument_id, { state: 2, limit: 20 }).then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.get('/futures/information/', function(req, response) {
    const { query = {} } = req;
    const { currency } = query.params || query;
    request.get(`${config.urlHost}/api/information/v3/${currency}/long_short_ratio`).then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.get('/futures/information/sentiment', function(req, response) {
    const { query = {} } = req;
    const { currency } = query.params || query;
    request.get(`${config.urlHost}/api/information/v3/${currency}/sentiment`).then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.get('/futures/postLeverage', function(req, response) {
    const { query = {} } = req;
    const { underlying, leverage } = query;
    authClient.futures().postLeverage(underlying,query).then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.get('/swap/postLeverage', function(req, response) {
    const { query = {} } = req;
    const { instrument_id, leverage, side } = query;
    authClient.swap().postLeverage(instrument_id,{ leverage, side}).then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.get('/swap/postOrder', function(req, response) {
    const { params } = req;
    console.log(req)
    console.log(params)
    authClient.swap().postOrder(params).then(res => {
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });
});

app.listen(8090);

console.log('server start');
