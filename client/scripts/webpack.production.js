const webpack = require('webpack');
const path = require('path');
const merge = require('webpack-merge');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const rimraf = require('rimraf');

const {GenerateSW}=require('workbox-webpack-plugin');

const webpackConfig = require('./webpack.config');

const configs=require('../configs');
const appName=require('../configs/appName');
const rootDir=configs.PRD_ROOT_DIR;

// const appName=configs.APP_NAME;
const app=path.resolve(__dirname,`../${appName}`);
const build=path.resolve(app,configs.BUILD_DIR);

rimraf(build,err=>console.log(err));

module.exports = merge(webpackConfig, {
  mode:'production',
  devtool:'cheap-module-source-map',
  cache:false,
  output:{
    path:build,
    publicPath:rootDir,
  },
  optimization:{
    minimizer:[
      new TerserPlugin({
        // cache: true,
        parallel: true,
        // sourceMap: true,
        terserOptions: {
          ecma: undefined,
          warnings: false,
          parse: {},
          compress: {
            drop_console:true,
          },
          mangle: true,
        },
      }),
      new OptimizeCSSAssetsPlugin({
        cssProcessorPluginOptions: {
          preset:['default',{
            discardComments:{removeAll:true},
            calc: false,
            // normalizePositions: false,
          }],
        },
      }),
    ],
  },
  module:{
    rules:[{
      test:/\.css$/,
      use:[
        {
          loader:MiniCssExtractPlugin.loader,
          options:{
            // publicPath: '../',
          },
        },
        {
          loader:'css-loader',
          options:{
            importLoaders:1,
            modules: {
              mode:'global',
              localIdentName:'[hash:base64:5]',
            },
          },
        },
        // 'postcss-loader',
      ],
      // exclude: /components/,
    },{
      test:/\.less$/,
      use:[
        {
          loader:MiniCssExtractPlugin.loader,
          options:{
            // publicPath: '../',
          },
        },
        {
          loader:'css-loader',
          options:{
            importLoaders:1,
            modules: {
              mode:'global',
              localIdentName:'[hash:base64:5]',
            },
          },
        },
        // 'postcss-loader',
        {
          loader:'less-loader',
          options: {
            javascriptEnabled:true,
            // strictMath: true,//'parens-division',
            // strictUnits: true,
            // noIeCompat: true,
          },
        },
      ],
      // exclude: /components/,
    }],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename:'css/[name]_[contenthash:8].css',
      chunkFilename:'css/[id]_[name]_[contenthash:8].css',
      // publicPath:'../',
    }),
    new webpack.DefinePlugin({
      'process.env':{
        // NODE_ENV:JSON.stringify('production'),
        isDev:false,
      },
      EMAIL:JSON.stringify('ah.yiru@gmail.com'),
      VERSION:JSON.stringify('0.0.x'),
    }),
    new GenerateSW({
      // importWorkboxFrom: 'local',
      cacheId: 'demo-pwa',
      clientsClaim: true,
      skipWaiting: true,
    }),
  ],
});
