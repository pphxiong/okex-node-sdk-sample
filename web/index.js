import request from './utils/request';

var express = require('express')
var app = express()
var bodyParser = require('body-parser')

// var fs = require('fs')
// var querystring = require("querystring");
// var urlTool = require('url');
// var http = require('http');
// var request = require("request");
// var path = require('path');
// var formidable = require('formidable');
// var xlsx = require('node-xlsx');
// var proxy = require('http-proxy-middleware');

// 跨域插件
var cors = require('cors')
// const readline = require('readline');

// let https = require('https')
// const httpsOption = {
//   key: fs.readFileSync('./web/html/https/3010273_paopaofunplus.com.key'),
//   cert: fs.readFileSync('./web/html/https/3010273_paopaofunplus.com.pem')
// }
// https.createServer(httpsOption, app).listen(443)

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(cors())

app.listen(80, err => {
  if (err) {
    console.log(err)
  } else {
    console.log('server run!')
  }
})

const url = require('url');

function proxyRequest(req, res, next) {
  const curl= url.parse(req.url);
  let { path } = curl;
  if(path.includes('okex')){
    path = path.replace('/okex', ':8090');
    path = 'http://www.paopaofunplus.com' + path;

    return request.get(path)
  }

  return new Promise(resolve=>resolve({ type: 'normal' }))

}

app.all('*', function (req, res, next) {
  // console.log(req);
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type,Content-Length, Authorization, Accept,X-Requested-With'
  )
  res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS')
  proxyRequest(req, res, next).then(response=>{
    console.log(response)
    const { type } = response;
    if(type=='normal'){
      if (req.method == 'OPTIONS') res.send(200)
      /* 让options请求快速返回 */ else next()
    }else{
      res.send(response)
    }
  })
})

app.get('/api/currentUser', function(req, res) {
  const data = {
    name: 'Serati Ma',
    avatar: 'https://gw.alipayobjects.com/zos/antfincdn/XAosXuNZyF/BiazfanxmamNRoxxVxka.png',
    userid: '00000001',
    email: 'antdesign@alipay.com',
    signature: '海纳百川，有容乃大',
    title: '交互专家',
    group: '蚂蚁金服－某某某事业群－某某平台部－某某技术部－UED',
    tags: [
      {
        key: '0',
        label: '很有想法的',
      },
      {
        key: '1',
        label: '专注设计',
      },
      {
        key: '2',
        label: '辣~',
      },
      {
        key: '3',
        label: '大长腿',
      },
      {
        key: '4',
        label: '川妹子',
      },
      {
        key: '5',
        label: '海纳百川',
      },
    ],
    notifyCount: 12,
    unreadCount: 11,
    country: 'China',
    geographic: {
      province: {
        label: '浙江省',
        key: '330000',
      },
      city: {
        label: '杭州市',
        key: '330100',
      },
    },
    address: '西湖区工专路 77 号',
    phone: '0752-268888888',
  };
  res.send(data)
});

app.post('/api/login/account', function(req, res) {
  const { password, userName, type } = req.body;

  if (password === '@Xiong092479' && userName === 'pphxiong') {
    res.send({
      status: 'ok',
      type,
      currentAuthority: 'admin',
    });
    return;
  }

  res.send({
    status: 'error',
    type,
    currentAuthority: 'guest',
  });
});


app.use('/',express.static('./dist'))
