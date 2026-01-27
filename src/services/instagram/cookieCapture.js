const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

class InstagramCookieCapture {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    console.log('🚀 Launching browser...');
    
    this.browser = await puppeteer.launch({
      headless: false, // Show browser for manual login
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
      ]
    });

    this.page = await this.browser.newPage();
    
    // Set realistic viewport
    await this.page.setViewport({ width: 1366, height: 768 });
    
    // Set user agent
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('✅ Browser launched');
  }

  async navigateToInstagram() {
    console.log('🌐 Navigating to Instagram...');
    await this.page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    console.log('✅ Instagram loaded');
  }

  async waitForManualLogin(timeoutMinutes = 5) {
  console.log(`⏳ Waiting for manual login (${timeoutMinutes} minutes)...`);
  console.log('👉 Please log in to Instagram in the browser window');
  
  const startTime = Date.now();
  const timeout = timeoutMinutes * 60 * 1000;

  while (Date.now() - startTime < timeout) {
    const url = this.page.url();
    
    // Check if logged in (redirected to feed)
    if (url.includes('instagram.com') && !url.includes('/accounts/login')) {
      console.log('✅ Login detected!');
      
      // Wait a bit for cookies to be set
      await new Promise(resolve => setTimeout(resolve, 3000));
      return true;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Login timeout - please try again');
}

  async extractCookies() {
    console.log('🍪 Extracting cookies...');
    
    const cookies = await this.page.cookies();
    
    // Extract important cookies
    const sessionid = cookies.find(c => c.name === 'sessionid')?.value;
    const csrftoken = cookies.find(c => c.name === 'csrftoken')?.value;
    const ds_user_id = cookies.find(c => c.name === 'ds_user_id')?.value;

    if (!sessionid) {
      throw new Error('Session cookie not found - login may have failed');
    }

    console.log('✅ Cookies extracted');
    
    return {
      cookies: cookies,
      sessionid,
      csrftoken,
      ds_user_id,
      userAgent: await this.page.evaluate(() => navigator.userAgent)
    };
  }

  async getUsername() {
  console.log('👤 Getting username...');
  
  try {
    // Method 1: Try the accounts/edit page
    console.log('   Trying method 1: accounts/edit page...');
    await this.page.goto('https://www.instagram.com/accounts/edit/', {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    let username = await this.page.evaluate(() => {
      const usernameInput = document.querySelector('input[name="username"]');
      return usernameInput ? usernameInput.value : null;
    });

    if (username) {
      console.log(`✅ Username found (method 1): ${username}`);
      return username;
    }

    // Method 2: Try extracting from API response
    console.log('   Trying method 2: intercepting API calls...');
    await this.page.goto('https://www.instagram.com/', {
      waitUntil: 'networkidle2',
      timeout: 15000
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    username = await this.page.evaluate(() => {
      try {
        // Check various places where Instagram stores username
        if (window._sharedData?.config?.viewer?.username) {
          return window._sharedData.config.viewer.username;
        }

        // Check in scripts
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const script of scripts) {
          const text = script.textContent;
          const match = text.match(/"username":"([^"]+)"/);
          if (match && match[1] && !match[1].includes('instagram')) {
            return match[1];
          }
        }

        return null;
      } catch (e) {
        return null;
      }
    });

    if (username) {
      console.log(`✅ Username found (method 2): ${username}`);
      return username;
    }

    // Method 3: Get username by clicking on profile
    console.log('   Trying method 3: navigating to profile...');
    
    // Click on profile icon/link
    const profileClicked = await this.page.evaluate(() => {
      const profileLinks = Array.from(document.querySelectorAll('a'));
      const myProfile = profileLinks.find(link => {
        const ariaLabel = link.getAttribute('aria-label');
        return ariaLabel && (
          ariaLabel.includes('Profile') || 
          ariaLabel.includes('Your profile')
        );
      });
      
      if (myProfile) {
        myProfile.click();
        return true;
      }
      return false;
    });

    if (profileClicked) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const currentUrl = this.page.url();
      const match = currentUrl.match(/instagram\.com\/([^/?]+)/);
      if (match && match[1]) {
        username = match[1];
        console.log(`✅ Username found (method 3): ${username}`);
        return username;
      }
    }

    // Method 4: Last resort - parse from cookies/headers
    console.log('   Trying method 4: checking cookies...');
    const cookies = await this.page.cookies();
    const userId = cookies.find(c => c.name === 'ds_user_id')?.value;
    
    if (userId) {
      console.log(`⚠️ Could not get username, using user ID: ${userId}`);
      return userId;
    }

    throw new Error('Could not determine username or user ID');
    
  } catch (error) {
    console.error('❌ Failed to get username:', error.message);
    
    // Return user ID as last resort
    const cookies = await this.page.cookies();
    const userId = cookies.find(c => c.name === 'ds_user_id')?.value;
    return userId || 'unknown';
  }
}

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('✅ Browser closed');
    }
  }

  async capture() {
    try {
      await this.init();
      await this.navigateToInstagram();
      await this.waitForManualLogin();
      
      const cookieData = await this.extractCookies();
      const username = await this.getUsername();

      return {
        success: true,
        username,
        ...cookieData
      };
    } catch (error) {
      console.error('❌ Cookie capture failed:', error);
      throw error;
    } finally {
      await this.close();
    }
  }
}


module.exports = InstagramCookieCapture;