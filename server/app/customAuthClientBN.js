import request from '../utils/request';
import * as crypto from 'crypto';
import * as querystring from "querystring";

function customAuthClient(key, secret, apiUri = 'https://api.binance.com', timeout = 3000, axiosConfig = {}) {
    const signRequest = (method, path, options = {}) => {
        const timestamp = Date.now() / 1000;
        const what = timestamp + method.toUpperCase() + path + (options.body || '');
        const hmac = crypto.createHmac('sha256', secret);
        const signature = hmac.update(what).digest('base64');
        // sign=CryptoJS.enc.Base64.Stringify(CryptoJS.HmacSHA256(timestamp + 'GET' + '/users/self/verify', SecretKey))
        return {
            key,
            signature,
            timestamp
        };
    };

    const getSignature = (method, relativeURI, opts = {}) => {
        const sig = signRequest(method, relativeURI, opts);
        return {
            'X-MBX-APIKEY': sig.key,
            signature: sig.signature,
            timestamp: sig.timestamp
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
        body['signature'] = signObj.signature;
        body['timestamp'] = signObj.timestamp;
        const headers = {
            'X-MBX-APIKEY': signObj['X-MBX-APIKEY'],
            'content-type': 'application/json; charset=utf-8'
        }
        return request(apiUri + url,{
            method: 'POST',
            headers,
            data: body
        })
    }

    return {
        swap: {
            postOrder: function(params){
                return post('/api/v3/order', params)
            },
        }
    }

}


module.exports = customAuthClient;
