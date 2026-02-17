const { execSync } = require('child_process');

/**
 * Get the Chrome/Chromium executable path for Puppeteer
 * Tries multiple locations to find a working Chrome binary
 */
function getChromePath() {
  // 1. Try the bundled Chromium from puppeteer package
  try {
    const puppeteerCore = require('puppeteer');
    const bundledPath = puppeteerCore.executablePath();
    if (bundledPath) {
      console.log(`🌐 Using bundled Chromium: ${bundledPath}`);
      return bundledPath;
    }
  } catch (e) {
    console.log('Bundled Chromium not found, checking system...');
  }

  // 2. Try common system Chromium locations
  const possiblePaths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/snap/bin/chromium',
  ];

  for (const p of possiblePaths) {
    try {
      const fs = require('fs');
      if (fs.existsSync(p)) {
        console.log(`🌐 Using system Chrome: ${p}`);
        return p;
      }
    } catch (e) {
      // continue
    }
  }

  // 3. Try to find via 'which' command
  try {
    const result = execSync('which chromium-browser || which chromium || which google-chrome', {
      encoding: 'utf-8',
    }).trim();
    if (result) {
      console.log(`🌐 Found Chrome via which: ${result}`);
      return result;
    }
  } catch (e) {
    // not found
  }

  // 4. Return undefined and let Puppeteer try its default
  console.log('⚠️ No Chrome found, letting Puppeteer try default...');
  return undefined;
}

/**
 * Standard Puppeteer launch options for server environments
 */
function getLaunchOptions(overrides = {}) {
  const executablePath = getChromePath();

  const options = {
    headless: 'new',
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled',
      '--single-process',
      '--no-zygote',
    ],
    ...overrides,
  };

  // Remove executablePath if undefined so Puppeteer uses default
  if (!options.executablePath) {
    delete options.executablePath;
  }

  return options;
}

module.exports = { getChromePath, getLaunchOptions };
