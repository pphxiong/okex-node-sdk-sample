require('babel-register') ({
    presets: [ 'env' ]
})
require('babel-polyfill');

module.exports = require('./app/swapApiV5.js')
module.exports = require('./app/customAuthClientV5.js')
