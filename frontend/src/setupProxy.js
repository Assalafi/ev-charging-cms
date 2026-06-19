const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
	const apiTarget = process.env.REACT_APP_API_URL || 'https://evcharging.eride.ng';
  app.use(
    '/api',
    createProxyMiddleware({
      target: apiTarget,
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
