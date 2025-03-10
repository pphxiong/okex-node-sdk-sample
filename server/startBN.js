require('babel-register')({
	presets: ['env'],
});
require('babel-polyfill');

// module.exports = require('./app/swapApiBN.js');
module.exports = require('./app/swapApiDS.js');
