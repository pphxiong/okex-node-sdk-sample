require('babel-register')({
	presets: ['env'],
});
require('babel-polyfill');

// module.exports = require('./app/swapSimulationTest.js')
module.exports = require('./app/swapApiDSTest.js');
