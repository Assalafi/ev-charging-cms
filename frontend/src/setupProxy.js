const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const apiTarget = process.env.REACT_APP_PROXY_TARGET || 'http://localhost:5000';
  app.use(
    createProxyMiddleware({
      target: apiTarget,
      changeOrigin: true,
      pathFilter: '/api',
      logger: console
    })
  );
};
