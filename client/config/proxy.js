/**
 * 在生产环境 代理是无法生效的，所以这里没有生产环境的配置
 * The agent cannot take effect in the production environment
 * so there is no configuration of the production environment
 * For details, please see
 * https://pro.ant.design/docs/deploy
 */
export default {
  dev: {
    '/api/': {
      target: 'https://preview.pro.ant.design',
      changeOrigin: true,
      pathRewrite: {
        '^': '',
      },
    },
    '/okex/':{
      target: 'http://8.210.214.167:8090',
      changeOrigin: true,
      pathRewrite: {
        '/okex/': '/',
      },
    },
    '/okexSwap/':{
      target: 'http://8.210.214.167:8091',
      changeOrigin: true,
      pathRewrite: {
        '/okexSwap/': '/',
      },
    }
  },
  test: {
    '/api/': {
      target: 'https://preview.pro.ant.design',
      changeOrigin: true,
      pathRewrite: {
        '^': '',
      },
    },
  },
  pre: {
    '/api/': {
      target: 'your pre url',
      changeOrigin: true,
      pathRewrite: {
        '^': '',
      },
    },
  },
};
