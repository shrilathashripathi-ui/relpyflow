const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');
const { encrypt } = require('../utils/encryption');

const router = express.Router();
const prisma = new PrismaClient();

// Start OAuth - Using Facebook Login for Instagram Graph API
router.get('/auth', protect, (req, res) => {
  // For Instagram Graph API (Business/Creator accounts), we use Facebook OAuth
  // This gives access to instagram_basic, instagram_manage_comments, instagram_manage_messages
  const scopes = [
    'instagram_basic',
    'instagram_manage_comments',
    'instagram_manage_messages',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_read_user_content',
    'business_management'
  ].join(',');

  // Add auth_type=rerequest to force re-asking for permissions
  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.INSTAGRAM_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.INSTAGRAM_REDIRECT_URI)}&scope=${scopes}&response_type=code&auth_type=rerequest`;

  res.json({ authUrl });
});

// OAuth Callback - Handle Facebook OAuth response
router.get('/callback', async (req, res) => {
  try {
    const { code, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('OAuth Error:', error, error_description);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/connect-instagram?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/connect-instagram?error=No authorization code received`);
    }

    // Step 1: Exchange code for Facebook access token
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: process.env.INSTAGRAM_CLIENT_ID,
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
        code,
      }
    });

    const fbAccessToken = tokenResponse.data.access_token;

    // Step 2: Get Facebook Pages the user manages
    const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: { access_token: fbAccessToken }
    });

    console.log('=== DEBUG: Pages Response ===');
    console.log(JSON.stringify(pagesResponse.data, null, 2));

    const pages = pagesResponse.data.data;

    if (!pages || pages.length === 0) {
      // Let's also check what permissions we have
      const debugResponse = await axios.get('https://graph.facebook.com/v18.0/me/permissions', {
        params: { access_token: fbAccessToken }
      });
      console.log('=== DEBUG: Permissions ===');
      console.log(JSON.stringify(debugResponse.data, null, 2));

      // Also try to get user info
      const meResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
        params: {
          access_token: fbAccessToken,
          fields: 'id,name,accounts{id,name,access_token,instagram_business_account}'
        }
      });
      console.log('=== DEBUG: Me Response with accounts ===');
      console.log(JSON.stringify(meResponse.data, null, 2));

      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/connect-instagram?error=No Facebook Pages found. Please connect a Facebook Page to your Instagram account.`);
    }

    // Step 3: Get Instagram Business Account for each page
    let instagramAccount = null;
    let pageAccessToken = null;

    for (const page of pages) {
      try {
        const igResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}`, {
          params: {
            fields: 'instagram_business_account',
            access_token: page.access_token
          }
        });

        if (igResponse.data.instagram_business_account) {
          instagramAccount = igResponse.data.instagram_business_account;
          pageAccessToken = page.access_token;
          break;
        }
      } catch (err) {
        console.log(`No IG account for page ${page.name}`);
      }
    }

    if (!instagramAccount) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/connect-instagram?error=No Instagram Business account found. Please link an Instagram Business/Creator account to your Facebook Page.`);
    }

    // Step 4: Get Instagram account details
    const igDetailsResponse = await axios.get(`https://graph.facebook.com/v18.0/${instagramAccount.id}`, {
      params: {
        fields: 'id,username,profile_picture_url,followers_count',
        access_token: pageAccessToken
      }
    });

    const igDetails = igDetailsResponse.data;

    // Redirect to frontend with account info
    const params = new URLSearchParams({
      success: 'true',
      igUserId: igDetails.id,
      username: igDetails.username,
      accessToken: pageAccessToken, // Page access token is used for Instagram API
    });

    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/connect-instagram?${params.toString()}`);

  } catch (error) {
    console.error('OAuth Callback Error:', error.response?.data || error.message);
    const errorMsg = error.response?.data?.error?.message || error.message;
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/connect-instagram?error=${encodeURIComponent(errorMsg)}`);
  }
});

// Direct Instagram Login (Session-based with Puppeteer)
router.post('/direct-login', protect, async (req, res) => {
  const puppeteer = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  const { getLaunchOptions } = require('../utils/browserHelper');
  puppeteer.use(StealthPlugin());

  let browser = null;

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    console.log(`🔐 Attempting direct login for @${username}...`);

    // Launch headless browser with proper Chrome path
    browser = await puppeteer.launch(getLaunchOptions());

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Go to Instagram login page
    console.log('📱 Loading Instagram login page...');
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    // Wait a bit for page to fully load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Try to accept cookies if dialog appears
    try {
      const acceptCookiesBtn = await page.$('button[tabindex="0"]');
      if (acceptCookiesBtn) {
        const btnText = await page.evaluate(el => el.textContent, acceptCookiesBtn);
        if (btnText && (btnText.includes('Allow') || btnText.includes('Accept') || btnText.includes('Only Allow'))) {
          console.log('🍪 Accepting cookies dialog...');
          await acceptCookiesBtn.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (e) {
      console.log('No cookie dialog found, continuing...');
    }

    // Wait for login form with multiple possible selectors
    console.log('⏳ Waiting for login form...');
    let usernameInput = null;

    // Try different selectors
    const selectors = [
      'input[name="username"]',
      'input[aria-label="Phone number, username, or email"]',
      'input[aria-label="Username"]',
      'input[type="text"]'
    ];

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        usernameInput = await page.$(selector);
        if (usernameInput) {
          console.log(`✅ Found input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!usernameInput) {
      // Take screenshot for debugging
      console.log('❌ Could not find login form. Page content:');
      const pageContent = await page.content();
      console.log(pageContent.substring(0, 500));
      await browser.close();
      return res.status(400).json({
        error: 'Could not load Instagram login page. Please try again or use Facebook connection.'
      });
    }

    // Fill in credentials
    console.log('✏️ Entering credentials...');
    await usernameInput.click({ clickCount: 3 }); // Select all
    await usernameInput.type(username, { delay: 100 });

    // Find password field
    const passwordInput = await page.$('input[name="password"]') ||
                          await page.$('input[type="password"]');

    if (!passwordInput) {
      await browser.close();
      return res.status(400).json({ error: 'Could not find password field' });
    }

    await passwordInput.click();
    await passwordInput.type(password, { delay: 100 });

    // Find and click login button with navigation handling
    console.log('🔘 Clicking login button...');
    let loginButton = await page.$('button[type="submit"]');
    if (!loginButton) {
      // Try finding button by text content
      loginButton = await page.evaluateHandle(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent.trim().toLowerCase().includes('log in')) return btn;
        }
        return null;
      });
      if (loginButton && !(await loginButton.jsonValue !== undefined)) {
        // evaluateHandle returns a JSHandle, check if it's not null
        const isNull = await loginButton.evaluate(el => el === null);
        if (isNull) loginButton = null;
      }
    }

    try {
      // Click button or press Enter, and wait for navigation simultaneously
      if (loginButton) {
        console.log('Found submit button, clicking...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
          loginButton.click()
        ]);
      } else {
        console.log('No submit button found, pressing Enter...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
          page.keyboard.press('Enter')
        ]);
      }
    } catch (navError) {
      // Navigation errors (context destroyed) are expected during login redirect
      console.log('Navigation occurred (expected):', navError.message?.substring(0, 80));
    }

    // Wait for page to settle after navigation
    console.log('⏳ Waiting for login response...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check current URL
    let currentUrl;
    try {
      currentUrl = page.url();
    } catch (e) {
      // If page context is gone, try to get URL from browser
      const pages = await browser.pages();
      const activePage = pages[pages.length - 1];
      currentUrl = activePage.url();
      // Replace page reference if needed
    }
    console.log('📍 Current URL:', currentUrl);

    // Check for error messages safely (page context might have changed)
    let errorMessage = null;
    try {
      errorMessage = await page.evaluate(() => {
        const selectors = [
          '[role="alert"]',
          '#slfErrorAlert',
          'p[data-testid="login-error-message"]',
          '[data-testid="login-error-message"]',
        ];

        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent && el.textContent.trim().length > 0) {
            return el.textContent.trim();
          }
        }

        // Check form area for error spans
        const formArea = document.querySelector('form') || document.querySelector('#loginForm');
        if (formArea) {
          const spans = formArea.querySelectorAll('span');
          for (const span of spans) {
            const text = span.textContent?.trim();
            if (text && (
              text.toLowerCase().includes('sorry') ||
              text.toLowerCase().includes('incorrect') ||
              text.toLowerCase().includes('wrong') ||
              text.toLowerCase().includes('doesn\'t') ||
              text.toLowerCase().includes('wasn\'t')
            )) {
              return text;
            }
          }
        }

        return null;
      });
    } catch (evalError) {
      console.log('Could not check for errors (page navigated):', evalError.message?.substring(0, 60));
    }

    if (errorMessage) {
      console.log('❌ Login error detected:', errorMessage);
      await browser.close();
      return res.status(401).json({
        error: 'Invalid username or password. Please check your credentials and try again.'
      });
    }

    // Check if we need 2FA or checkpoint
    if (currentUrl.includes('challenge') || currentUrl.includes('checkpoint') || currentUrl.includes('two_factor')) {
      console.log('⚠️ Challenge/2FA required');
      await browser.close();
      return res.status(400).json({
        error: 'Instagram requires additional verification (2FA or security checkpoint). Please check your Instagram app for a verification prompt, then try again.'
      });
    }

    // Check if login was successful (redirected away from login page)
    if (currentUrl.includes('/accounts/login')) {
      console.log('❌ Still on login page - credentials may be wrong');

      let finalErrorCheck = null;
      try {
        finalErrorCheck = await page.evaluate(() => {
          const allText = document.body.innerText;
          if (allText.includes('Sorry, your password was incorrect') ||
              allText.includes('password you entered is incorrect') ||
              allText.includes('username you entered doesn\'t belong')) {
            return 'Invalid username or password. Please check your credentials and try again.';
          }
          if (allText.includes('Please wait a few minutes')) {
            return 'Too many login attempts. Please wait a few minutes before trying again.';
          }
          return null;
        });
      } catch (e) {
        console.log('Could not read error text');
      }

      await browser.close();
      return res.status(401).json({
        error: finalErrorCheck || 'Invalid username or password. Please check your credentials and try again.'
      });
    }

    // Extract cookies
    console.log('🍪 Extracting session cookies...');
    const cookies = await page.cookies();

    const sessionid = cookies.find(c => c.name === 'sessionid')?.value;
    const csrftoken = cookies.find(c => c.name === 'csrftoken')?.value;
    const ds_user_id = cookies.find(c => c.name === 'ds_user_id')?.value;

    if (!sessionid) {
      console.log('❌ No session cookie found');
      await browser.close();
      return res.status(400).json({ error: 'Login failed - no session created. Try Facebook connection.' });
    }

    // Format cookies for storage
    const sessionCookies = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    await browser.close();
    browser = null;

    console.log('✅ Login successful! Saving account...');

    // Check if account already exists for ANY user (Instagram accounts should be unique)
    const existingAccount = await prisma.instagramAccount.findFirst({
      where: { username: username }
    });

    if (existingAccount) {
      if (existingAccount.userId === req.user.id) {
        // Same user - update the session instead
        await prisma.instagramAccount.update({
          where: { id: existingAccount.id },
          data: {
            sessionCookies,
            csrfToken: csrftoken,
            status: 'active',
            encryptedPassword: encrypt(password),
          }
        });
        return res.status(200).json({
          success: true,
          username: username,
          message: `Session refreshed for @${username}`,
        });
      } else {
        // Different user owns this account
        return res.status(400).json({
          error: `@${username} is already connected to another account.`
        });
      }
    }

    // Encrypt password for auto re-login capability
    const encryptedPassword = encrypt(password);

    // Save to database with encrypted password for auto re-login
    const account = await prisma.instagramAccount.create({
      data: {
        userId: req.user.id,
        igUserId: ds_user_id,
        username,
        sessionCookies,
        csrfToken: csrftoken,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        status: 'active',
        encryptedPassword: encryptedPassword,
        autoReloginEnabled: true, // Enable auto re-login by default
      },
    });

    res.status(201).json({
      success: true,
      username: account.username,
      message: `Successfully connected @${username}`,
      autoReloginEnabled: true
    });

  } catch (error) {
    console.error('Direct login error:', error.message);

    if (browser) {
      await browser.close();
    }

    // Check for unique constraint (account already exists)
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'This Instagram account is already connected' });
    }

    // Timeout error
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return res.status(400).json({ error: 'Login timed out. Instagram may be slow. Please try again.' });
    }

    res.status(500).json({ error: 'Failed to connect Instagram. Please try again or use Facebook connection.' });
  }
});

// Save Instagram Account
router.post('/account', protect, async (req, res) => {
  try {
    const { igUserId, username, sessionCookies, csrfToken } = req.body;

    const account = await prisma.instagramAccount.create({
      data: {
        userId: req.user.id,
        igUserId,
        username,
        sessionCookies,
        csrfToken,
        status: 'active',
      },
    });

    res.status(201).json({ account });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete/Disconnect Instagram Account
router.delete('/account/:id', protect, async (req, res) => {
  try {
    const { id } = req.params;

    // Find the account and verify ownership
    const account = await prisma.instagramAccount.findFirst({
      where: {
        id,
        userId: req.user.id
      }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Delete the account
    await prisma.instagramAccount.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: `@${account.username} has been disconnected`
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Connected Accounts
router.get('/accounts', protect, async (req, res) => {
  try {
    console.log('📱 Fetching accounts for user:', req.user.id, req.user.email);

    const accounts = await prisma.instagramAccount.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        username: true,
        status: true,
        createdAt: true,
      },
    });

    console.log('📱 Found accounts:', accounts.length, accounts.map(a => a.username));
    res.json({ accounts });
  } catch (error) {
    console.error('📱 Error fetching accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Posts/Reels for an account
router.get('/accounts/:id/media', protect, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the account and verify ownership
    const account = await prisma.instagramAccount.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!account.sessionCookies) {
      return res.status(400).json({ error: 'Account session not available. Please reconnect.' });
    }

    // Fetch media from Instagram
    const headers = {
      'User-Agent': account.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie': account.sessionCookies,
      'X-CSRFToken': account.csrfToken,
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': '*/*',
      'Referer': 'https://www.instagram.com/',
    };

    const response = await axios.get(
      `https://www.instagram.com/api/v1/feed/user/${account.igUserId}/`,
      {
        headers,
        params: { count: 20 },
        timeout: 30000
      }
    );

    // Check for HTML response (session issue)
    if (typeof response.data === 'string' && response.data.includes('<!DOCTYPE')) {
      return res.status(401).json({
        error: 'Session expired or blocked. Please reconnect your account.',
        code: 'SESSION_EXPIRED'
      });
    }

    const items = response.data?.items || [];

    // Format media for frontend
    const media = items.map(item => ({
      id: item.pk?.toString() || item.id,
      code: item.code,
      type: item.media_type === 1 ? 'photo' : item.media_type === 2 ? 'video' : 'carousel',
      thumbnailUrl: item.image_versions2?.candidates?.[0]?.url ||
                    item.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url ||
                    null,
      caption: item.caption?.text?.substring(0, 100) || '',
      likeCount: item.like_count || 0,
      commentCount: item.comment_count || 0,
      takenAt: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : null,
      url: `https://www.instagram.com/p/${item.code}/`
    }));

    res.json({ media });

  } catch (error) {
    console.error('Fetch media error:', error.message);

    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({
        error: 'Session expired. Please reconnect your account.',
        code: 'SESSION_EXPIRED'
      });
    }

    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
