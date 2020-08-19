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
        console.log(JSON.stringify(res))
        send(response, { errcode: 0, errmsg: 'ok', data: res })
    });

});




app.listen(80);

console.log('server start');
