require('babel-register') ({
    presets: [ 'env' ]
})
require('babel-polyfill');

module.exports = require('./app/index.js')
module.exports = require('./app/customAuthClient.js')
