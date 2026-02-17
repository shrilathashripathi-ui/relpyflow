/**
 * Puppeteer configuration for DigitalOcean App Platform
 * Skip bundled Chrome download - we use system Chromium installed via Aptfile
 */
module.exports = {
  skipDownload: true,
};
