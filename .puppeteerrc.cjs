const { join } = require('path');

/**
 * Puppeteer configuration for DigitalOcean App Platform
 * Cache Chrome inside node_modules so it persists with the deployment
 */
module.exports = {
  cacheDirectory: join(__dirname, 'node_modules', '.cache', 'puppeteer'),
};
