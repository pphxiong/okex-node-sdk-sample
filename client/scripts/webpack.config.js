const webpack = require('webpack');
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// const ModuleFederationPlugin = require('webpack/lib/container/ModuleFederationPlugin');

const configs=require('../configs');
const appName=require('../configs/appName');

// const appName=configs.APP_NAME;
const publics=path.resolve(__dirname,configs.PUBLIC_DIR);
const app=path.resolve(__dirname,`../${appName}`);

const entry={
  app:[path.resolve(app,'index.js')],
  react:['react','react-dom'],
};
const templ=path.resolve(publics,'index.html');
const icon=path.resolve(publics,'favicon.ico');

const htmlPlugin=()=>new HtmlWebpackPlugin({
  title:appName,
  template:templ,
  favicon:icon,
  inject:true,
  minify:{
    html5:true,
    collapseWhitespace:true,
    // conservativeCollapse:true,
    removeScriptTypeAttributes:true,
    removeStyleLinkTypeAttributes:true,
    removeComments:true,
    removeTagWhitespace:true,
    removeEmptyAttributes:true,
    removeRedundantAttributes:true,
    useShortDoctype:true,
    keepClosingSlash:true,
    minifyJS:true,
    minifyCSS:true,
    minifyURLs:true,
  },
});

const plugins=[
  htmlPlugin(),
  new webpack.LoaderOptionsPlugin({
    minimize: false,
  }),
  /* new webpack.optimize.LimitChunkCountPlugin({
    maxChunks: 5,
  }), */
  new webpack.optimize.MinChunkSizePlugin({
    minChunkSize: 30000,
  }),
  new webpack.optimize.ModuleConcatenationPlugin(),
  // new BundleAnalyzerPlugin(),
  /* new ModuleFederationPlugin({
    name:'app_two',
    library:{ type:'global',name:'app_a'},
    // filename:'remoteEntry.js',
    remotes:{
      app_one:'app_one',
      app_three:'app_three',
    },
    exposes:{
      AppContainer:'./src/App',
    },
    shared:['react','react-dom','relay-runtime'],
  }), */
];

const rules=[
  {
    test:/\.(js|jsx|mjs)$/,
    loader:'babel-loader',
    exclude:[/node_modules/,path.resolve(__dirname,'node')],
  },{
    test:/\.tsx?$/,
    use:[
      {loader:'babel-loader'},
      {loader:'ts-loader'},
    ],
    exclude:[/node_modules/],
  },{
    test: /\.html$/,
    use: {
      loader: 'html-loader',
      options: {
        minimize:true,
      },
    },
    include:[app],
  },{
    test:/\.(jpe?g|png|gif|psd|bmp|ico|webp|svg)/i,
    loader:'url-loader',
    options:{
      limit:20480,
      name:'img/img_[hash:8].[ext]',
      // publicPath:'../',
    },
    exclude:[/node_modules/],
  },{
    test:/\.(ttf|eot|svg|woff|woff2|otf)/,
    loader:'url-loader',
    options:{
      limit:20480,
      name:'fonts/[hash:8].[ext]',
      publicPath:'../',
    },
    exclude:[/images/],
  },{
    test:/\.(pdf)/,
    loader:'url-loader',
    options:{
      limit:20480,
      name:'pdf/[hash].[ext]',
    },
  },{
    test:/\.(swf|xap|mp4|webm)/,
    loader:'url-loader',
    options:{
      limit:20480,
      name:'video/[hash].[ext]',
    },
  },
];

module.exports={
  context:app,
  entry:entry,
  output:{
    path:path.resolve(app,configs.BUILD_DIR),
    publicPath:configs.DEV_ROOT_DIR,
    filename:'js/[name]_[hash:8].js',
    chunkFilename:'js/[name]_[chunkhash:8].chunk.js',
    // library:`${appName}App`,
    // libraryTarget:'umd',
  },
  optimization:{
    minimize:true,
    concatenateModules:true,
    occurrenceOrder:true,

    usedExports: true,
    sideEffects: true,

    splitChunks:{
      chunks:'all',//'async','initial'
      minSize:0,
      /* minSize:{
        javascript:30000,
        style:30000,
      }, */
      minChunks:2,
      maxInitialRequests:5,
      cacheGroups:{
        commons:{
          // chunks:'initial',
          // minSize:30000,
          name:'commons',
          test:app,
          priority: 5,
          reuseExistingChunk:true,
        },
        vendors:{
          // chunks:'initial',
          name:'vendors',
          test:/[\\/]node_modules[\\/]/,
          enforce:true,
          priority:10,
        },
        react:{
          name:'react',
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          enforce:true,
          priority:15,
        },
      },
    },
    // runtimeChunk:true,
    moduleIds:'hashed',
    chunkIds:'named',
  },
  resolve:{
    modules:[
      app,
      'node_modules',
    ],
    alias:{
      '@app':app,
      '@common':path.resolve(__dirname, '../commons'),
      '@utils':path.resolve(app, 'utils'),
      '@router':path.resolve(__dirname, '../playground/src/router'),
    },
    extensions:['.js','.mjs','.cjs','.jsx','.ts','.tsx','.json','.css','.less','.vue','.vuex'],
  },
  module:{
    rules:rules,
  },
  plugins:plugins,
};


