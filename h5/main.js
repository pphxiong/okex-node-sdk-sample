const fs = require('fs');

const express = require('express');
// 用来解决 history 模式404问题
const history = require('connect-history-api-fallback');
// 跨域支持 官方文档：https://github.com/expressjs/cors
const cors = require('cors');

// // 引入外部路由文件
// const appRouter = require('./router/appRouter')
// const adminRouter = require('./router/adminRouter')
const app = express();
const port = 80;

app.use(history());
app.use(express.json());
app.use(express.static(__dirname + '/www'));

// 开启所有请求都支持跨域
app.use(cors());

// 处理 / 根请求
// app.get('/static', (req, res) => {
// 	console.log(11, req.url);
// 	const filePath = `${__dirname}/${req.url}`;
// 	res.sendFile(filePath);
// });

app.listen(port, () => {
	console.log(`node服务已启动 端口号为： ${port}`);
});
