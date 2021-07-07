require('babel-register') ({
    presets: [ 'env' ]
})
require('babel-polyfill');

module.exports = require('./app/swapApi.js')
module.exports = require('./app/customAuthClientV5.js')
// module.exports = require('./check.js')

// module.exports = require('./app/swapSimulationApi.js')
// module.exports = require('./app/customSimulationAuthClient.js')
