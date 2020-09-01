import request from '../utils/request';

const {AuthenticatedClient} = require('@okfe/okex-node');

var config = require('./config');

const authClient = new AuthenticatedClient(
    config.httpkey,
    config.httpsecret,
    config.passphrase,
    config.urlHost
);

const cusotmAuthClient = {
    ...authClient,
    account: {
        ...authClient.account,
        getAssetValuation: function (type) {
            return request.get(`/api/account/v3/asset-valuation?account_type=${type}&valuation_currency=btc`)
        }
    }
}

module.exports = { ...cusotmAuthClient };
