import request from '../utils/request';
import * as crypto from 'crypto';
import * as querystring from "querystring";

function customAuthClient(key, secret, apiUri = 'https://fapi.binance.com', timeout = 3000, axiosConfig = {}) {
    const signRequest = (method, path, options = {}) => {
        const timestamp = Date.now();
        // const what = timestamp + method.toUpperCase() + path + (options.body || '');
        const what = (options.body ? `${options.body}&` :'') + 'timestamp=' + timestamp;
        const hmac = crypto.createHmac('sha256', secret);
        const signature = hmac.update(what).digest('hex').toString('base64');
        // const signature=CryptoJS.enc.Base64.Stringify(CryptoJS.HmacSHA256(timestamp + 'GET' + '/users/self/verify', SecretKey))
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
        const signObj = getSignature('GET', url)
        const { timestamp, signature } = signObj;
        const headers = {
            'X-MBX-APIKEY': signObj['X-MBX-APIKEY'],
        }
        return request(apiUri + url + `?timestamp=${timestamp}&signature=${signature}`,{
            method: 'GET',
            headers
        })
    }

    const post = function(url, body, params) {
        // const bodyJson = JSON.stringify(body);
        const bodyJson = querystring.stringify(body)
        const signObj = getSignature('POST', url, { body: bodyJson });
        body['signature'] = signObj.signature;
        body['timestamp'] = signObj.timestamp;
        const headers = {
            'X-MBX-APIKEY': signObj['X-MBX-APIKEY'],
            // 'Content-Type': 'application/json;charset=UTF-8',
            // 'content-type': 'application/x-www-form-urlencoded'
        }
        return request(apiUri + url + '?' + querystring.stringify(body),{
            method: 'POST',
            headers,
            // data: body
        })
    }

    return {
        swap: {
            postOrder: function(params){
                return post('/fapi/v1/order', params)
            },
            getPosition: function (instrument_id, instType){
                return get(`/fapi/v2/account`)
            },
        }
    }

}


module.exports = customAuthClient;
