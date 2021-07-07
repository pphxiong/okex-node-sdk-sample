require('babel-register') ({
    presets: [ 'env' ]
})
require('babel-polyfill');

module.exports = require('./app/swapApiV3.js')
module.exports = require('./app/customAuthClient.js')
