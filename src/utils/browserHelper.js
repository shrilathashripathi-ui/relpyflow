const { execSync } = require('child_process');
const fs = require('fs');

/**
 * Get the Chrome/Chromium executable path for Puppeteer
 * Priority: Bundled Chrome (from puppeteer npm) → System Chromium → which command
 */
function getChromePath() {
  // 1. Try the bundled Chromium from puppeteer package (most reliable)
  try {
    const puppeteerPkg = require('puppeteer');
    const bundledPath = puppeteerPkg.executablePath();
    if (bundledPath && fs.existsSync(bundledPath)) {
      console.log(`🌐 Using bundled Chromium: ${bundledPath}`);
      return bundledPath;
    }
  } catch (e) {
    console.log('Bundled Chromium not available, checking system...');
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
    const result = execSync('which chromium-browser || which chromium || which google-chrome 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
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

  if (!options.executablePath) {
    delete options.executablePath;
  }

  return options;
}

module.exports = { getChromePath, getLaunchOptions };
