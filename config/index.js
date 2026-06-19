const development = require('./development');
const production = require('./production');
const defaultConfig = require('./default');

const env = process.env.NODE_ENV || 'production';

const configs = {
  development,
  production,
  default: defaultConfig,
};

// Export the configuration based on the environment
module.exports = configs[env] || defaultConfig;
