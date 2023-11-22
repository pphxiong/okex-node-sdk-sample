const fs = require('fs');

const express = require('express');
// 跨域支持 官方文档：https://github.com/expressjs/cors
const cors = require('cors');

// // 引入外部路由文件
// const appRouter = require('./router/appRouter')
// const adminRouter = require('./router/adminRouter')
const app = express();
const port = 80;

app.use(express.json());
app.use(express.static('www'));
// 开启所有请求都支持跨域
app.use(cors());

// 处理 / 根请求
app.get('/static', (req, res) => {
	console.log(11, req.url);
	const filePath = `${__dirname}/${req.url}`;

	// fs.readFile(`${__dirname}/www${req.url}`, (err, data) => {
	// 	if (err) {
	// 		throw err;
	// 	} else {
	// 		res.end(data);
	// 	}
	// });
	res.sendFile(filePath);
});

app.listen(port, () => {
	console.log(`node服务已启动 端口号为： ${port}`);
});
