require('babel-register') ({
    presets: [ 'env' ]
})
require('babel-polyfill');

module.exports = require('./app/swapSimulationApi.js')
module.exports = require('./app/customSimulationAuthClient.js')
