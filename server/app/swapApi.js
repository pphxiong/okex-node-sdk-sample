
const {AuthenticatedClient} = require('@okfe/okex-node');
const customAuthClient = require('./customAuthClient');
var config = require('./config');
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

var express = require('express');
var app = express();

app.get('/swap/postLeverage', function(req, response) {
    const {query = {}} = req;
    const {instrument_id, leverage, side} = query;
    authClient
        .swap()
        .postLeverage(instrument_id, {leverage, side})
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
});

app.get('/swap/getAccount', function(req, response) {
    const {query = {}} = req;
    const { instrument_id } = query;
    authClient
        .swap()
        .getAccount(instrument_id)
        .then(res => {
            send(response, {errcode: 0, errmsg: 'ok', data: res});
        });
});


module.exports.swapApi = app;
