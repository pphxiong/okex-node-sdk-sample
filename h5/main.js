const express = require('express');
// 跨域支持 官方文档：https://github.com/expressjs/cors
const cors = require('cors');

// // 引入外部路由文件
// const appRouter = require('./router/appRouter')
// const adminRouter = require('./router/adminRouter')
const app = express();
const port = 80;

app.use(express.json());
// 开启所有请求都支持跨域
app.use(cors());

// 注册路由, 注册的路由模块接口访问都需要加上 注册路由的前缀
// app.use('/app', appRouter)
// app.use('/admin', adminRouter)

// 处理 / 根请求
app.get('/', (req, res) => {
	const filePath = __dirname + '/index.html';

	res.sendFile(filePath);
});

app.listen(port, () => {
	console.log(`node服务已启动 端口号为： ${port}`);
});
