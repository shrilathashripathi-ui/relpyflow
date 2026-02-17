const { join } = require('path');

/**
 * Puppeteer configuration for DigitalOcean App Platform
 * Ensures Chromium is downloaded during npm install
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
