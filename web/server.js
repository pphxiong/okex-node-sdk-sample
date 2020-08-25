var express = require('express')
var app = express()
var bodyParser = require('body-parser')

var fs = require('fs')
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

app.all('*', function (req, res, next) {
  // console.log(req);
  res.header('Access-Control-Allow-Origin', '*')
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type,Content-Length, Authorization, Accept,X-Requested-With'
  )
  res.header('Access-Control-Allow-Methods', 'PUT,POST,GET,DELETE,OPTIONS')
  if (req.method == 'OPTIONS') res.send(200)
  /* 让options请求快速返回 */ else next()
})

app.get('/api/currentUser', function(req, res) {
  const {query = {}} = req;
  res.send({errcode: 0, errmsg: 'ok', data: query })
});

app.post('/api/login/account', function(req, res) {
  const {query = {}, params, data} = req;
  console.log(req)
  res.send({errcode: 0, errmsg: 'ok', data: {query, params, data} })
});

app.use(express.static('./dist'))
