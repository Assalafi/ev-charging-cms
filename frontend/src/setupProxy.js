const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3000',
      changeOrigin: true,
      // Add default auth headers to all requests
      onProxyReq: (proxyReq, req, res) => {
        // Add mock token for development
        proxyReq.setHeader('Authorization', `Bearer dev-mock-token-for-testing`);
      },
      // Log proxied requests for debugging
      logLevel: 'debug'
    })
  );
};
