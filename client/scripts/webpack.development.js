const webpack = require('webpack');
const merge = require('webpack-merge');
// const {GenerateSW}=require('workbox-webpack-plugin');
const webpackConfig = require('./webpack.config');
module.exports=merge(webpackConfig,{
  mode:'development',
  devtool:'cheap-module-eval-source-map',
  cache:true,
  // target:'web',
  entry:{
    app:['webpack-hot-middleware/client?reload=true'],
  },
  module:{
    rules:[
      {
        test:/\.css$/,
        use:[
          'style-loader',
          {
            loader: 'css-loader',
            options:{
              importLoaders:1,
              modules:{
                mode:'global',
                localIdentName:'[path][name]__[local]--[hash:base64:5]',
              },
            },
          },
          // 'postcss-loader',
        ],
        // exclude:[/node_modules/],
      },
      {
        test:/\.less$/,
        use: [
          'style-loader',
          {
            loader:'css-loader',
            options:{
              importLoaders:1,
              modules:{
                mode:'global',
                localIdentName:'[path][name]__[local]--[hash:base64:5]',
              },
            },
          },
          // 'postcss-loader',
          {
            loader:'less-loader',
            options:{
              javascriptEnabled:true,
              // strictMath: true,//'parens-division',
              // strictUnits: true,
              // noIeCompat: true,
            },
          },
        ],
        // exclude:[/node_modules/],
      },
    ],
  },
  plugins:[
    new webpack.HotModuleReplacementPlugin(),
    new webpack.DefinePlugin({
      'process.env':{
        // NODE_ENV:JSON.stringify('development'),
        isDev:true,
      },
      EMAIL:JSON.stringify('ah.yiru@gmail.com'),
      VERSION:JSON.stringify('0.0.x'),
    }),
    /*new GenerateSW({
      // include: [/\.html$/, /\.js$/, /\.css$/],
      // exclude: '/node_modules/',
      // swDest: 'service-worker.js',
      // swDest:path.join(configs.BUILD_DIR, 'js/sw.js'),
      // navigateFallback: '/index.html', // SPA fallback
      // globDirectory:configs.BUILD_DIR,
      // importsDirectory: '/',
      // importWorkboxFrom: 'local',
      cacheId: 'demo-pwa',
      clientsClaim: true,
      skipWaiting: true,
    }),*/
  ],
});
