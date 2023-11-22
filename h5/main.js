/*
1.html中所有的外部链接（href、src)，都会变成网络请求
*/

// 1导入模块
const http = require('http');
const fs = require('fs');

// 2创建服务器
const app = http.createServer((req, res) => {
	// (1)req请求报文
	console.log(req.url);
	// (2)处理数据
	if (req.url === '/') {
		// (3)res响应报文
		fs.readFile(`${__dirname}/www/index.html`, (err, data) => {
			if (err) {
				throw err;
			} else {
				res.end(data);
			}
		});
	} else if (req.url.startsWith('/static')) {
		fs.readFile(`${__dirname}/www${req.url}`, (err, data) => {
			if (err) {
				throw err;
			} else {
				res.end(data);
			}
		});
	} else {
		res.end('404 NOT FOUND');
	}
});

// const express = require('express');
// // 跨域支持 官方文档：https://github.com/expressjs/cors
// const cors = require('cors');

// // // 引入外部路由文件
// // const appRouter = require('./router/appRouter')
// // const adminRouter = require('./router/adminRouter')
// const app = express();
// const port = 80;

// app.use(express.json());
// app.use(express.static('www'));
// // 开启所有请求都支持跨域
// app.use(cors());

// 处理 / 根请求
// app.get('/', (req, res) => {
// 	const filePath = __dirname + '/index.html';

// 	res.sendFile(filePath);
// });

app.listen(port, () => {
	console.log(`node服务已启动 端口号为： ${port}`);
});
