import request from '../utils/request';
import * as crypto from 'crypto';

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
            method: 'get',
            headers: getSignature('get', url)
        })
    }

    const post = function(url, body, params) {
        const bodyJson = JSON.stringify(body);
        const signObj = getSignature('post', url, { body: bodyJson });
        signObj['content-type'] = 'application/json; charset=utf-8';
        return request(apiUri + url,{
            method: 'post',
            headers: signObj
        })
    }

    return {
        account: {
            getAssetValuation: function (type = 3) {
                return get(`/api/account/v3/asset-valuation?account_type=${type}&valuation_currency=btc`)
            }
        },
        futures: {
            getMarkPrice: function (instrument_id){
                return get(`/api/futures/v3/instruments/${instrument_id}/mark_price`)
            },
            closePosition: function (params) {
                return post('/api/futures/v3/close_position', params)
            }
        }
    }

}


module.exports = customAuthClient;
