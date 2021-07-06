import request from '../utils/request';
import * as crypto from 'crypto';
import * as querystring from "querystring";

function customAuthClient(key, secret, passphrase, apiUri = 'https://www.okex.com', timeout = 3000, axiosConfig = {}) {
    const signRequest = (method, path, options = {}) => {
        const timestamp = Date.now() / 1000;
        const what = timestamp + method.toUpperCase() + path + (options.body || '');
        const hmac = crypto.createHmac('sha256', secret);
        const signature = hmac.update(what).digest('base64');
        return {
            key,
            passphrase,
            signature,
            timestamp
        };
    };

    const getSignature = (method, relativeURI, opts = {}) => {
        const sig = signRequest(method, relativeURI, opts);
        return {
            'OK-ACCESS-KEY': sig.key,
            'OK-ACCESS-PASSPHRASE': sig.passphrase,
            'OK-ACCESS-SIGN': sig.signature,
            'OK-ACCESS-TIMESTAMP': sig.timestamp
        };
    };

    const get = function(url, params) {
        return request(apiUri + url,{
            method: 'GET',
            headers: getSignature('GET', url)
        })
    }

    const post = function(url, body, params) {
        const bodyJson = JSON.stringify(body);
        const signObj = getSignature('POST', url, { body: bodyJson });
        signObj['content-type'] = 'application/json; charset=utf-8';
        return request(apiUri + url,{
            method: 'POST',
            headers: signObj,
            data: body
        })
    }

    return {
        swap: {
            getMarkPrice: function (instrument_id){
                return get(`/api/v5/market/index-tickers?instId=${instrument_id}`)
            },
            getPosition: function (instrument_id){
                return get(`/api/v5/account/positions?instId=${instrument_id}`)
            },
            postOrder: function(params){
                return post('/api/v5/trade/order', params)
            },
            closePosition: function (params) {
                return post('/api/swap/v3/close_position', params)
            },
            getHistory: function (instrument_id, params) {
                return get(`/api/v5/market/history-candles?instId=${instrument_id}&` + querystring.stringify(params));
            },
            // getKData: function (instrument_id, params) {
            //     return get(`/api/swap/v3/instruments/${instrument_id}/candles?` + querystring.stringify(params));
            // },
        }
    }

}


module.exports = customAuthClient;
