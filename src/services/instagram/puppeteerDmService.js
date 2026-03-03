const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { PrismaClient } = require('@prisma/client');
const { encrypt, decrypt } = require('../../utils/encryption');
const { getLaunchOptions } = require('../../utils/browserHelper');

puppeteer.use(StealthPlugin());

const prisma = new PrismaClient();

class PuppeteerDMService {
  constructor(account) {
    this.account = account;
    this.browser = null;
    this.page = null;
  }

  /**
   * Initialize browser with account's session cookies
   */
  async init() {
    console.log(`🚀 Initializing browser for @${this.account.username}...`);

    this.browser = await puppeteer.launch(getLaunchOptions());

    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(30000);           // 30s default for all waitFor*
    this.page.setDefaultNavigationTimeout(45000); // 45s for goto/navigation
    await this.page.setViewport({ width: 1366, height: 768 });
    await this.page.setUserAgent(this.account.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Parse and set cookies from stored session
    if (this.account.sessionCookies) {
      const cookies = this.parseCookies(this.account.sessionCookies);
      await this.page.setCookie(...cookies);
      console.log(`   Set ${cookies.length} cookies`);
    }

    return this;
  }

  /**
   * Parse cookie string into cookie objects
   */
  parseCookies(cookieString) {
    return cookieString.split('; ').map(cookie => {
      const [name, ...valueParts] = cookie.split('=');
      return {
        name: name.trim(),
        value: valueParts.join('='),
        domain: '.instagram.com',
        path: '/'
      };
    }).filter(c => c.name && c.value);
  }

  /**
   * Check if session is still valid, auto re-login if not
   */
  async isSessionValid() {
    try {
      await this.page.goto('https://www.instagram.com/direct/inbox/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.sleep(2000);

      const currentUrl = this.page.url();

      // If redirected to login, session is invalid
      if (currentUrl.includes('/accounts/login') || currentUrl.includes('/challenge')) {
        console.log('   ❌ Session invalid - redirected to login');

        // Try auto re-login if enabled
        if (this.account.autoReloginEnabled && this.account.encryptedPassword) {
          console.log('   🔄 Attempting auto re-login...');
          const reloginSuccess = await this.autoRelogin();
          if (reloginSuccess) {
            console.log('   ✅ Auto re-login successful!');
            return true;
          } else {
            console.log('   ❌ Auto re-login failed');
            return false;
          }
        }

        return false;
      }

      // Check if we're on the inbox page
      const onInbox = currentUrl.includes('/direct');
      console.log(`   ${onInbox ? '✅' : '❌'} Session ${onInbox ? 'valid' : 'invalid'}`);

      return onInbox;
    } catch (error) {
      console.error('   Session check error:', error.message);
      return false;
    }
  }

  /**
   * Auto re-login using stored encrypted password
   */
  async autoRelogin() {
    try {
      // Decrypt the password
      const password = decrypt(this.account.encryptedPassword);
      if (!password) {
        console.log('   ❌ Could not decrypt password');
        return false;
      }

      // Check if we've failed too many times recently
      if (this.account.reloginFailCount >= 3) {
        const lastAttempt = this.account.lastReloginAt;
        const hoursSinceLastAttempt = lastAttempt
          ? (Date.now() - new Date(lastAttempt).getTime()) / (1000 * 60 * 60)
          : 999;

        if (hoursSinceLastAttempt < 1) {
          console.log('   ⏳ Too many re-login failures, waiting...');
          return false;
        }
      }

      // Go to login page
      await this.page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      await this.sleep(3000);

      // Accept cookies if dialog appears
      try {
        const acceptBtn = await this.page.$('button[tabindex="0"]');
        if (acceptBtn) {
          const btnText = await this.page.evaluate(el => el.textContent, acceptBtn);
          if (btnText && (btnText.includes('Allow') || btnText.includes('Accept'))) {
            await acceptBtn.click();
            await this.sleep(2000);
          }
        }
      } catch (e) {}

      // Find and fill login form
      const usernameInput = await this.page.$('input[name="username"]');
      const passwordInput = await this.page.$('input[name="password"]');

      if (!usernameInput || !passwordInput) {
        throw new Error('Could not find login form');
      }

      await usernameInput.type(this.account.username, { delay: 100 });
      await passwordInput.type(password, { delay: 100 });

      // Click login
      const loginButton = await this.page.$('button[type="submit"]');
      if (loginButton) {
        await loginButton.click();
      } else {
        await this.page.keyboard.press('Enter');
      }

      await this.sleep(7000);

      // Check if login successful
      const currentUrl = this.page.url();
      if (currentUrl.includes('/accounts/login') || currentUrl.includes('/challenge')) {
        // Login failed
        await prisma.instagramAccount.update({
          where: { id: this.account.id },
          data: {
            reloginFailCount: { increment: 1 },
            lastReloginAt: new Date()
          }
        });
        return false;
      }

      // Extract new cookies
      const cookies = await this.page.cookies();
      const sessionCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      const csrfToken = cookies.find(c => c.name === 'csrftoken')?.value;

      // Update account with new session (encrypted at rest)
      await prisma.instagramAccount.update({
        where: { id: this.account.id },
        data: {
          sessionCookies: encrypt(sessionCookies),
          csrfToken: encrypt(csrfToken),
          status: 'active',
          reloginFailCount: 0,
          lastReloginAt: new Date()
        }
      });

      // Update local account object (plaintext for in-memory use)
      this.account.sessionCookies = sessionCookies;
      this.account.csrfToken = csrfToken;

      // Navigate to inbox to verify
      await this.page.goto('https://www.instagram.com/direct/inbox/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.sleep(2000);

      return this.page.url().includes('/direct');

    } catch (error) {
      console.error('   Auto re-login error:', error.message);

      await prisma.instagramAccount.update({
        where: { id: this.account.id },
        data: {
          reloginFailCount: { increment: 1 },
          lastReloginAt: new Date()
        }
      });

      return false;
    }
  }

  /**
   * Send DM to a user using browser automation
   * Uses inbox method first (works for private accounts too!)
   */
  async sendDM(recipientUsername, message) {
    console.log(`📤 Sending DM to @${recipientUsername}...`);

    try {
      // Try inbox method FIRST - this works for both public and private accounts
      console.log('   Trying direct inbox method (works for private accounts)...');
      const inboxSuccess = await this.sendDMViaInbox(recipientUsername, message);
      if (inboxSuccess) {
        return { success: true, method: 'inbox' };
      }

      console.log('   Inbox method failed, trying profile method...');

      // Fallback: Navigate to user's profile
      console.log(`   Navigating to @${recipientUsername}'s profile...`);
      await this.page.goto(`https://www.instagram.com/${recipientUsername}/`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.sleep(2000);

      // Check if profile exists
      const pageContent = await this.page.content();
      if (pageContent.includes("Sorry, this page isn't available") ||
          pageContent.includes("Page Not Found")) {
        throw new Error(`User @${recipientUsername} not found`);
      }

      // Find and click the Message button
      console.log('   Looking for Message button...');

      // Try multiple selectors for the message button
      const messageButtonSelectors = [
        'div[role="button"]:has-text("Message")',
        'button:has-text("Message")',
        '[data-testid="message_button"]',
        'div._acan._acap._acas._aj1-._ap30' // Common Instagram button class
      ];

      let messageButtonClicked = false;

      // Try using evaluate to find and click Message button
      messageButtonClicked = await this.page.evaluate(() => {
        // Find all elements that might be the message button
        const elements = document.querySelectorAll('div[role="button"], button');
        for (const el of elements) {
          if (el.textContent.trim() === 'Message') {
            el.click();
            return true;
          }
        }
        return false;
      });

      if (!messageButtonClicked) {
        // Try clicking by coordinates if button text method failed
        // Look for the button in a different way
        const buttons = await this.page.$$('div[role="button"]');
        for (const button of buttons) {
          const text = await this.page.evaluate(el => el.textContent, button);
          if (text && text.trim() === 'Message') {
            await button.click();
            messageButtonClicked = true;
            break;
          }
        }
      }

      if (!messageButtonClicked) {
        // Both methods failed
        throw new Error('DM_RESTRICTED: Could not send DM - user may have DM restrictions enabled or account is private');
      }

      console.log('   Clicked Message button, waiting for chat...');
      await this.sleep(3000);

      // Wait for the message input to appear
      const messageInputSelectors = [
        'textarea[placeholder*="Message"]',
        'div[contenteditable="true"][role="textbox"]',
        'textarea[aria-label*="Message"]',
        'div[aria-label*="Message"][contenteditable="true"]'
      ];

      let messageInput = null;
      for (const selector of messageInputSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          messageInput = await this.page.$(selector);
          if (messageInput) {
            console.log(`   Found message input: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!messageInput) {
        // Try to find contenteditable div
        messageInput = await this.page.$('div[contenteditable="true"]');
      }

      if (!messageInput) {
        throw new Error('Could not find message input field');
      }

      // Type the message
      console.log('   Typing message...');
      await messageInput.click();
      await this.sleep(500);

      // Type character by character for more human-like behavior
      await messageInput.type(message, { delay: 50 });

      await this.sleep(1000);

      // Find and click Send button
      console.log('   Looking for Send button...');

      const sendClicked = await this.page.evaluate(() => {
        // Look for Send button
        const buttons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toLowerCase();
          if (text === 'send') {
            btn.click();
            return true;
          }
        }

        // Also try to find by aria-label
        const sendBtn = document.querySelector('[aria-label="Send"]') ||
                       document.querySelector('button[type="submit"]');
        if (sendBtn) {
          sendBtn.click();
          return true;
        }

        return false;
      });

      if (!sendClicked) {
        // Try pressing Enter as fallback
        console.log('   Send button not found, pressing Enter...');
        await this.page.keyboard.press('Enter');
      }

      await this.sleep(2000);

      // Verify message was sent by checking if input is cleared
      console.log('   ✅ DM sent successfully!');

      return { success: true };

    } catch (error) {
      console.error(`   ❌ Failed to send DM: ${error.message}`);

      // Check for specific errors
      if (error.message.includes('not found')) {
        throw new Error(`USER_NOT_FOUND: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Dismiss any popups/notifications that might be blocking
   */
  async dismissPopups() {
    try {
      await this.page.evaluate(() => {
        // Look for "Not Now" or close buttons
        const buttons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toLowerCase();
          if (text === 'not now' || text === 'cancel' || text === 'close') {
            btn.click();
            return true;
          }
        }
        // Also try clicking outside modal
        const modal = document.querySelector('[role="dialog"]');
        if (modal) {
          const backdrop = modal.parentElement;
          if (backdrop) backdrop.click();
        }
        return false;
      });
      await this.sleep(500);
    } catch (e) {
      // Ignore errors - popup might not exist
    }
  }

  /**
   * Alternative method: Send DM via inbox (new message) - Works for private accounts too!
   */
  async sendDMViaInbox(recipientUsername, message) {
    try {
      console.log('   Trying inbox method for @' + recipientUsername + '...');

      // Go to direct new message URL
      await this.page.goto('https://www.instagram.com/direct/new/', {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.sleep(2000);

      // Dismiss any popups (like "Turn on Notifications")
      await this.dismissPopups();
      await this.sleep(1000);

      // Look for the search/recipient input field
      let searchInput = null;

      // Try multiple selectors for the search input
      const searchSelectors = [
        'input[placeholder*="Search"]',
        'input[name="queryBox"]',
        'input[type="text"]',
        'input[aria-label*="Search"]'
      ];

      for (const selector of searchSelectors) {
        searchInput = await this.page.$(selector);
        if (searchInput) {
          console.log('   Found search input with selector:', selector);
          break;
        }
      }

      if (!searchInput) {
        // Try clicking on "To:" field first
        await this.page.evaluate(() => {
          const toField = document.querySelector('input') ||
                         document.querySelector('[placeholder]');
          if (toField) toField.click();
        });
        await this.sleep(1000);

        searchInput = await this.page.$('input');
      }

      if (!searchInput) {
        console.log('   Could not find search input');
        return false;
      }

      // Clear and type username
      await searchInput.click({ clickCount: 3 });
      await this.sleep(300);
      await searchInput.type(recipientUsername, { delay: 80 });

      console.log('   Searching for @' + recipientUsername + '...');
      await this.sleep(3000);

      // Dismiss any popups again (in case one appeared)
      await this.dismissPopups();

      // Click on the user from search results - look for EXACT username match
      const userClicked = await this.page.evaluate((username) => {
        // First, dismiss any notification popup
        const notNowBtns = document.querySelectorAll('button');
        for (const btn of notNowBtns) {
          if (btn.textContent.trim().toLowerCase() === 'not now') {
            btn.click();
            break;
          }
        }

        // Wait a tiny bit for popup to close
        return new Promise(resolve => {
          setTimeout(() => {
            // Look for the exact username in search results
            // Instagram shows username in a span or div
            const allSpans = document.querySelectorAll('span, div');

            for (const el of allSpans) {
              const text = (el.textContent || '').trim();
              // Check for EXACT username match (Instagram shows as "_shri.ai_" or just the username)
              if (text === username || text === '@' + username || text.toLowerCase() === username.toLowerCase()) {
                // Find the clickable row (parent with role="button" or the row container)
                let clickTarget = el;
                for (let i = 0; i < 10; i++) {
                  if (!clickTarget.parentElement) break;
                  clickTarget = clickTarget.parentElement;
                  if (clickTarget.getAttribute('role') === 'button' ||
                      clickTarget.classList.contains('x1i10hfl') || // Instagram's clickable class
                      clickTarget.tagName === 'A') {
                    clickTarget.click();
                    resolve('clicked-exact-match');
                    return;
                  }
                }
                // If no role=button parent found, click the element itself
                el.click();
                resolve('clicked-element-direct');
                return;
              }
            }

            // Fallback: look for any element containing the username
            const elements = document.querySelectorAll('[role="button"], button');
            for (const el of elements) {
              const text = el.textContent || '';
              if (text.toLowerCase().includes(username.toLowerCase())) {
                el.click();
                resolve('clicked-fallback');
                return;
              }
            }

            // Try clicking on the search result row directly
            const rows = document.querySelectorAll('[role="listbox"] > div, [role="list"] > div');
            for (const row of rows) {
              if (row.textContent.toLowerCase().includes(username.toLowerCase())) {
                row.click();
                resolve('clicked-row');
                return;
              }
            }

            resolve(false);
          }, 500);
        });
      }, recipientUsername);

      if (!userClicked) {
        console.log('   Could not find user in search results');
        return false;
      }

      console.log('   Selected user:', userClicked);
      await this.sleep(2000);

      // Dismiss any popups again
      await this.dismissPopups();

      // Click "Chat" or "Next" button to proceed
      const proceedClicked = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('div[role="button"], button');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toLowerCase();
          if (text === 'chat' || text === 'next' || text === 'open') {
            btn.click();
            return text;
          }
        }

        // Also try looking for a primary button
        const primaryBtn = document.querySelector('button[type="button"]');
        if (primaryBtn && primaryBtn.textContent) {
          primaryBtn.click();
          return 'primary-btn';
        }

        return false;
      });

      if (proceedClicked) {
        console.log('   Clicked proceed button:', proceedClicked);
      }

      await this.sleep(3000);

      // Find message input and type message
      let messageInput = null;

      const messageInputSelectors = [
        'textarea[placeholder*="Message"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"]',
        'textarea'
      ];

      for (const selector of messageInputSelectors) {
        messageInput = await this.page.$(selector);
        if (messageInput) {
          console.log('   Found message input with selector:', selector);
          break;
        }
      }

      if (!messageInput) {
        console.log('   Could not find message input in chat');
        return false;
      }

      // Click and type the message
      await messageInput.click();
      await this.sleep(300);
      await messageInput.type(message, { delay: 30 });
      await this.sleep(500);

      // Try to find and click Send button first
      const sendClicked = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('div[role="button"], button');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toLowerCase();
          if (text === 'send') {
            btn.click();
            return true;
          }
        }
        return false;
      });

      if (!sendClicked) {
        // Press Enter as fallback
        console.log('   Pressing Enter to send...');
        await this.page.keyboard.press('Enter');
      }

      await this.sleep(2000);

      console.log('   ✅ DM sent via inbox method!');
      return true;

    } catch (error) {
      console.error('   Inbox method failed:', error.message);
      return false;
    }
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if a user follows this account (for Ask for Follow feature)
   */
  async checkIfFollower(targetUsername) {
    console.log(`   🔍 Checking if @${targetUsername} follows @${this.account.username}...`);

    try {
      // Go to the user's profile
      await this.page.goto(`https://www.instagram.com/${targetUsername}/`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await this.sleep(2000);

      // Check if profile exists
      const pageContent = await this.page.content();
      if (pageContent.includes("Sorry, this page isn't available")) {
        console.log(`   ⚠️ User @${targetUsername} not found`);
        return { found: false, isFollower: false };
      }

      // Check if this user follows us by looking at the "Following" button state
      // If we see "Follow Back" they follow us, if we see "Follow" they don't
      const followStatus = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button, div[role="button"]');
        for (const btn of buttons) {
          const text = btn.textContent.trim().toLowerCase();
          // "Follow Back" means they follow us
          if (text === 'follow back') {
            return 'follows_us';
          }
          // Check for "Follows you" text anywhere on page
          if (text.includes('follows you')) {
            return 'follows_us';
          }
        }

        // Also check for "Follows you" badge
        const spans = document.querySelectorAll('span');
        for (const span of spans) {
          if (span.textContent.toLowerCase().includes('follows you')) {
            return 'follows_us';
          }
        }

        return 'does_not_follow';
      });

      const isFollower = followStatus === 'follows_us';
      console.log(`   ${isFollower ? '✅' : '❌'} @${targetUsername} ${isFollower ? 'follows' : 'does not follow'} @${this.account.username}`);

      return { found: true, isFollower };

    } catch (error) {
      console.error(`   ❌ Error checking follower status: ${error.message}`);
      return { found: false, isFollower: false, error: error.message };
    }
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Re-login and update session cookies
   */
  async reLogin(username, password) {
    console.log(`🔐 Re-authenticating @${username}...`);

    try {
      await this.page.goto('https://www.instagram.com/accounts/login/', {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      await this.sleep(3000);

      // Accept cookies if dialog appears
      try {
        const acceptBtn = await this.page.$('button[tabindex="0"]');
        if (acceptBtn) {
          const btnText = await this.page.evaluate(el => el.textContent, acceptBtn);
          if (btnText && (btnText.includes('Allow') || btnText.includes('Accept'))) {
            await acceptBtn.click();
            await this.sleep(2000);
          }
        }
      } catch (e) {}

      // Find and fill login form
      const usernameInput = await this.page.$('input[name="username"]');
      const passwordInput = await this.page.$('input[name="password"]');

      if (!usernameInput || !passwordInput) {
        throw new Error('Could not find login form');
      }

      await usernameInput.type(username, { delay: 100 });
      await passwordInput.type(password, { delay: 100 });

      // Click login
      const loginButton = await this.page.$('button[type="submit"]');
      if (loginButton) {
        await loginButton.click();
      } else {
        await this.page.keyboard.press('Enter');
      }

      await this.sleep(7000);

      // Check if login successful
      const currentUrl = this.page.url();
      if (currentUrl.includes('/accounts/login')) {
        throw new Error('Login failed - check credentials');
      }

      // Extract new cookies
      const cookies = await this.page.cookies();
      const sessionCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      const csrfToken = cookies.find(c => c.name === 'csrftoken')?.value;

      // Update account in database (encrypted at rest)
      await prisma.instagramAccount.update({
        where: { id: this.account.id },
        data: {
          sessionCookies: encrypt(sessionCookies),
          csrfToken: encrypt(csrfToken),
          status: 'active'
        }
      });

      console.log('   ✅ Re-login successful, session updated');
      return true;

    } catch (error) {
      console.error('   ❌ Re-login failed:', error.message);
      return false;
    }
  }
}

module.exports = PuppeteerDMService;
