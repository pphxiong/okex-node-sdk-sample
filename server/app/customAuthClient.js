import request from '../utils/request';
import * as crypto from 'crypto';

var config = require('./config');

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
        return request(url,{
            method: 'get',
            headers: getSignature('get', url)
        })
    }

    return {
        account: {
            getAssetValuation: function (type) {
                return get(`/api/account/v3/asset-valuation?account_type=${type}&valuation_currency=btc`)
            }
        }
    }


// const cusotmAuthClient = {
//     account: {
//         ...authClient.account,
//         getAssetValuation: function (type) {
//             return request.get(`/api/account/v3/asset-valuation?account_type=${type}&valuation_currency=btc`)
//         }
//     }
// }
}


module.exports = customAuthClient;
