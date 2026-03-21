const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const { protect } = require('../middleware/auth');
const { encrypt, decryptAccountTokens } = require('../utils/encryption');
const { oauthLimiter, syncLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const prisma = require('../config/prisma');

// Start OAuth - Using Facebook Login for Instagram Graph API
// This is the PRODUCTION flow: Facebook Login → Page token → IG Business Account
// Required for messaging (Private Replies, DMs) which need a Page Access Token
//
// IMPORTANT: client_id must be the META APP ID (not the Instagram App ID).
// Uses FACEBOOK_APP_ID env var (or falls back to INSTAGRAM_CLIENT_ID for backwards compat).
router.get('/auth', oauthLimiter, protect, (req, res) => {
  // Facebook Login uses NON-business permission names (instagram_basic, not instagram_business_basic).
  // The instagram_business_* permissions are ONLY valid for Instagram Login dialog.
  const scopes = [
    'instagram_basic',
    'instagram_manage_comments',
    'instagram_manage_messages',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
  ].join(',');

  const fbAppId = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || process.env.INSTAGRAM_CLIENT_ID;
  const redirectUri = process.env.FB_REDIRECT_URI || process.env.FB_REDIRECT_URL || process.env.INSTAGRAM_REDIRECT_URI || process.env.INSTAGRAM_OAUTH_REDIRECT_URI;

  // Create signed state with userId (10 min expiry)
  const returnTo = req.query.returnTo || '';
  const state = jwt.sign(
    { userId: req.user.id, returnTo },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );

  const authUrl = `https://www.facebook.com/v22.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&response_type=code&state=${state}&auth_type=rerequest`;

  console.log('🔗 Facebook Login OAuth URL generated for user:', req.user.id);
  res.json({ authUrl });
});

// OAuth Callback - Handle Facebook OAuth response
// Saves Page Access Token + IG Business Account ID directly to the database
router.get('/callback', oauthLimiter, async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('Facebook OAuth Error:', error, error_description);
      return res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent(error_description || error)}`);
    }

    if (!code) {
      return res.redirect(`${frontendUrl}/connect-instagram?error=No authorization code received`);
    }

    // Verify state JWT to get userId
    let userId;
    let returnTo = '';
    if (state) {
      try {
        const decoded = jwt.verify(state, process.env.JWT_SECRET);
        userId = decoded.userId;
        returnTo = decoded.returnTo || '';
      } catch (e) {
        console.error('Invalid state token:', e.message);
        return res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent('Authorization expired. Please try again.')}`);
      }
    }

    if (!userId) {
      return res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent('Missing user context. Please try again.')}`);
    }

    const fbAppId = process.env.FACEBOOK_APP_ID || process.env.META_APP_ID || process.env.INSTAGRAM_CLIENT_ID;
    const fbAppSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || process.env.INSTAGRAM_CLIENT_SECRET;
    const redirectUri = process.env.FB_REDIRECT_URI || process.env.FB_REDIRECT_URL || process.env.INSTAGRAM_REDIRECT_URI || process.env.INSTAGRAM_OAUTH_REDIRECT_URI;

    // Step 1: Exchange code for short-lived Facebook user access token
    console.log('🔑 Exchanging code for Facebook access token...');
    const tokenResponse = await axios.get('https://graph.facebook.com/v22.0/oauth/access_token', {
      params: {
        client_id: fbAppId,
        client_secret: fbAppSecret,
        redirect_uri: redirectUri,
        code,
      }
    });

    const fbShortLivedToken = tokenResponse.data.access_token;
    console.log('✅ Got short-lived Facebook token');

    // Step 2: Exchange for long-lived Facebook user token (60 days)
    console.log('🔄 Exchanging for long-lived Facebook token...');
    const longLivedResponse = await axios.get('https://graph.facebook.com/v22.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: fbAppId,
        client_secret: fbAppSecret,
        fb_exchange_token: fbShortLivedToken,
      }
    });

    const fbLongLivedToken = longLivedResponse.data.access_token;
    console.log('✅ Got long-lived Facebook token');

    // Step 3: Get Facebook Pages — page tokens derived from long-lived user token are non-expiring
    console.log('📄 Fetching Facebook Pages...');
    const pagesResponse = await axios.get('https://graph.facebook.com/v22.0/me/accounts', {
      params: { access_token: fbLongLivedToken }
    });

    const pages = pagesResponse.data.data;

    if (!pages || pages.length === 0) {
      console.error('❌ No Facebook Pages found for user');
      return res.redirect(`${frontendUrl}/connect-instagram?error=No Facebook Pages found. Please connect a Facebook Page to your Instagram account.`);
    }

    console.log(`📄 Found ${pages.length} Facebook Page(s): ${pages.map(p => p.name).join(', ')}`);

    // Step 4: Find the Page with a linked Instagram Business Account
    let igBusinessAccountId = null;
    let pageAccessToken = null;
    let pageId = null;
    let pageName = null;

    for (const page of pages) {
      try {
        const igResponse = await axios.get(`https://graph.facebook.com/v22.0/${page.id}`, {
          params: {
            fields: 'instagram_business_account',
            access_token: page.access_token
          }
        });

        if (igResponse.data.instagram_business_account) {
          igBusinessAccountId = igResponse.data.instagram_business_account.id;
          pageAccessToken = page.access_token; // Non-expiring (derived from long-lived user token)
          pageId = page.id;
          pageName = page.name;
          console.log(`✅ Found IG Business Account ${igBusinessAccountId} on Page "${page.name}" (${page.id})`);
          break;
        }
      } catch (err) {
        console.log(`   No IG account for page "${page.name}"`);
      }
    }

    if (!igBusinessAccountId) {
      return res.redirect(`${frontendUrl}/connect-instagram?error=No Instagram Business account found. Please link an Instagram Business/Creator account to your Facebook Page.`);
    }

    // Step 5: Get Instagram account details using Page token
    console.log('👤 Fetching Instagram profile...');
    const igDetailsResponse = await axios.get(`https://graph.facebook.com/v22.0/${igBusinessAccountId}`, {
      params: {
        fields: 'id,username,name,profile_picture_url,followers_count',
        access_token: pageAccessToken
      }
    });

    const igDetails = igDetailsResponse.data;
    const username = igDetails.username;
    console.log(`✅ Instagram profile: @${username} (IGBA ID: ${igBusinessAccountId})`);

    // Step 6: Save to database (create or update)
    const existingAccount = await prisma.instagramAccount.findFirst({
      where: { username }
    });

    const accountData = {
      igUserId: igBusinessAccountId,
      accessToken: encrypt(pageAccessToken),
      accessTokenExpiry: null, // Page tokens from long-lived user tokens don't expire
      pageId: pageId,
      profilePictureUrl: igDetails.profile_picture_url || null,
      useOfficialApi: true,
      status: 'active',
      isPaused: false,
      pauseReason: null,
    };

    if (existingAccount) {
      if (existingAccount.userId === userId) {
        await prisma.instagramAccount.update({
          where: { id: existingAccount.id },
          data: accountData,
        });
        console.log(`✅ Updated account @${username} with Page token (Page: "${pageName}", ID: ${pageId})`);
      } else {
        return res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent(`@${username} is already connected to another account.`)}`);
      }
    } else {
      await prisma.instagramAccount.create({
        data: {
          userId,
          username,
          ...accountData,
        }
      });
      console.log(`✅ Created account @${username} with Page token (Page: "${pageName}", ID: ${pageId})`);
    }

    const redirectTarget = returnTo || '/connect-instagram';
    res.redirect(`${frontendUrl}${redirectTarget}?success=true&username=${encodeURIComponent(username)}`);

  } catch (error) {
    console.error('Facebook OAuth Callback Error:', error.response?.data || error.message);
    const errorMsg = error.response?.data?.error?.message || error.message;
    res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent(errorMsg)}`);
  }
});

// ============================================================
// Instagram OAuth Login (Official Instagram API - like ManyChat)
// ============================================================

// Start Instagram OAuth - returns the Instagram authorization URL
router.get('/auth/instagram', oauthLimiter, protect, (req, res) => {
  try {
    const appId = process.env.INSTAGRAM_APP_ID;
    const apiBase = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI || `${apiBase}/api/instagram/callback/instagram`;

    if (!appId) {
      return res.status(500).json({ error: 'Instagram App ID not configured' });
    }

    // Create signed state with userId and optional returnTo (10 min expiry)
    const returnTo = req.query.returnTo || '';
    const state = jwt.sign(
      { userId: req.user.id, returnTo },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );

    const scopes = [
      'instagram_business_basic',
      'instagram_business_manage_messages',
      'instagram_business_manage_comments'
    ].join(',');

    const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&auth_type=reauthenticate&client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scopes}&state=${state}`;

    console.log('🔗 Instagram OAuth URL generated for user:', req.user.id);
    res.json({ authUrl });
  } catch (error) {
    console.error('Instagram auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// Instagram OAuth Callback - handles the redirect from Instagram
router.get('/callback/instagram', oauthLimiter, async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  try {
    const { code, state, error, error_reason, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('Instagram OAuth error:', error, error_reason, error_description);
      return res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent(error_description || error_reason || error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent('No authorization code received')}`);
    }

    // Verify state JWT to get userId and returnTo
    let userId;
    let returnTo = '';
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET);
      userId = decoded.userId;
      returnTo = decoded.returnTo || '';
    } catch (e) {
      console.error('Invalid state token:', e.message);
      return res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent('Authorization expired. Please try again.')}`);
    }

    const appId = process.env.INSTAGRAM_APP_ID;
    const appSecret = process.env.INSTAGRAM_APP_SECRET;
    const apiBase = process.env.API_URL || `${req.protocol}://${req.get('host')}`;
    const redirectUri = process.env.INSTAGRAM_OAUTH_REDIRECT_URI || `${apiBase}/api/instagram/callback/instagram`;

    // Step 1: Exchange code for short-lived access token
    console.log('🔑 Exchanging code for access token...');
    const tokenResponse = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const shortLivedToken = tokenResponse.data.access_token;
    const igUserId = tokenResponse.data.user_id?.toString();

    console.log('✅ Got short-lived token for IG user:', igUserId);

    // Step 2: Exchange for long-lived token (60 days)
    console.log('🔄 Exchanging for long-lived token...');
    const longLivedResponse = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: appSecret,
        access_token: shortLivedToken,
      }
    });

    const longLivedToken = longLivedResponse.data.access_token;
    const expiresIn = longLivedResponse.data.expires_in; // seconds (typically 5184000 = 60 days)
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

    console.log('✅ Got long-lived token, expires:', tokenExpiry.toISOString());

    // Step 3: Get user profile
    console.log('👤 Fetching Instagram profile...');
    const profileResponse = await axios.get(`https://graph.instagram.com/v21.0/me`, {
      params: {
        fields: 'user_id,username,name,profile_picture_url',
        access_token: longLivedToken,
      }
    });

    const profile = profileResponse.data;
    const username = profile.username;

    console.log('✅ Instagram profile:', username);

    // Step 4: Create or update InstagramAccount
    const existingAccount = await prisma.instagramAccount.findFirst({
      where: { username }
    });

    if (existingAccount) {
      if (existingAccount.userId === userId) {
        // Same user - update token
        await prisma.instagramAccount.update({
          where: { id: existingAccount.id },
          data: {
            igUserId: igUserId || profile.user_id?.toString() || profile.id?.toString(),
            accessToken: encrypt(longLivedToken),
            accessTokenExpiry: tokenExpiry,
            profilePictureUrl: profile.profile_picture_url || null,
            useOfficialApi: true,
            status: 'active',
          }
        });
        console.log(`✅ Updated account @${username}`);
      } else {
        return res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent(`@${username} is already connected to another account.`)}`);
      }
    } else {
      await prisma.instagramAccount.create({
        data: {
          userId,
          igUserId: igUserId || profile.user_id?.toString() || profile.id?.toString(),
          username,
          accessToken: encrypt(longLivedToken),
          accessTokenExpiry: tokenExpiry,
          profilePictureUrl: profile.profile_picture_url || null,
          useOfficialApi: true,
          status: 'active',
        }
      });
      console.log(`✅ Created account @${username}`);
    }

    res.redirect(`${frontendUrl}/connect-instagram?success=true&username=${encodeURIComponent(username)}`);

  } catch (error) {
    console.error('Instagram OAuth callback error:', error.response?.data || error.message);
    const errorMsg = error.response?.data?.error_message || error.response?.data?.error?.message || error.message;
    res.redirect(`${frontendUrl}/connect-instagram?error=${encodeURIComponent(errorMsg)}`);
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

    // Set extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });

    // Enable JavaScript (should be default, but explicitly ensure)
    await page.setJavaScriptEnabled(true);

    // Go to Instagram login page
    console.log('📱 Loading Instagram login page...');
    await page.goto('https://www.instagram.com/accounts/login/', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for JS app to render the login form (Instagram is a SPA)
    console.log('⏳ Waiting for login form to render...');
    let usernameInput = null;

    // Try to find the username input with a long timeout (SPA needs time to mount)
    const selectors = [
      'input[name="username"]',
      'input[aria-label="Phone number, username, or email"]',
      'input[aria-label="Username"]',
      'input[type="text"]'
    ];

    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 20000, visible: true });
        usernameInput = await page.$(selector);
        if (usernameInput) {
          console.log(`✅ Found input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`Selector ${selector} not found, trying next...`);
        continue;
      }
    }

    // If still not found, try accepting cookies first then retry
    if (!usernameInput) {
      console.log('🍪 Trying to dismiss cookie/consent dialogs...');
      try {
        const buttons = await page.$$('button');
        for (const btn of buttons) {
          const text = await page.evaluate(el => el.textContent, btn);
          if (text && (text.includes('Allow') || text.includes('Accept') || text.includes('Only Allow') || text.includes('Decline'))) {
            console.log(`Clicking: ${text.trim()}`);
            await btn.click();
            await new Promise(resolve => setTimeout(resolve, 3000));
            break;
          }
        }
      } catch (e) { /* ignore */ }

      // Retry finding the input after dismissing dialogs
      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000, visible: true });
          usernameInput = await page.$(selector);
          if (usernameInput) {
            console.log(`✅ Found input after dialog dismiss: ${selector}`);
            break;
          }
        } catch (e) { continue; }
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
            sessionCookies: encrypt(sessionCookies),
            csrfToken: encrypt(csrftoken),
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
        sessionCookies: encrypt(sessionCookies),
        csrfToken: encrypt(csrftoken),
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

    decryptAccountTokens(account);

    // Revoke Instagram app permissions so next OAuth asks for username/password
    if (account.accessToken) {
      try {
        // Try revoking via Instagram Graph API (me/permissions)
        await axios.delete('https://graph.instagram.com/me/permissions', {
          params: { access_token: account.accessToken }
        });
        console.log(`🔓 Revoked Instagram permissions for @${account.username}`);
      } catch (revokeError) {
        console.warn(`⚠️ Instagram revoke failed:`,
          JSON.stringify(revokeError.response?.data),
          revokeError.response?.status,
          revokeError.message
        );
        // Try Facebook Graph API as fallback
        try {
          await axios.delete('https://graph.facebook.com/me/permissions', {
            params: { access_token: account.accessToken }
          });
          console.log(`🔓 Revoked via Facebook API for @${account.username}`);
        } catch (fbError) {
          console.warn(`⚠️ Facebook revoke also failed:`,
            JSON.stringify(fbError.response?.data),
            fbError.response?.status
          );
        }
      }
    }

    // Delete the account from database
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
        profilePictureUrl: true,
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
router.get('/accounts/:id/media', syncLimiter, protect, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the account and verify ownership
    const account = await prisma.instagramAccount.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    decryptAccountTokens(account);

    // Official API path for OAuth-connected accounts
    if (account.useOfficialApi && account.accessToken) {
      console.log(`📡 Media fetch for @${account.username} | igUserId: ${account.igUserId} | hasToken: true`);
      try {
        const officialApiService = require('../services/instagram/officialApiService');
        const mediaItems = await officialApiService.getUserMedia(account.accessToken, account.igUserId);
        const media = (mediaItems || []).map(item => ({
          id: item.id,
          thumbnail_url: item.thumbnail_url || item.media_url,
          media_url: item.media_url,
          caption: item.caption || '',
          media_type: item.media_type,
          permalink: item.permalink,
          timestamp: item.timestamp,
        }));
        return res.json({ media });
      } catch (officialError) {
        const errDetail = officialError.response?.data?.error || {};
        const statusCode = officialError.response?.status;
        console.error(`❌ Media fetch failed for @${account.username} | status: ${statusCode} | code: ${errDetail.code} | message: ${errDetail.message || officialError.message}`);
        return res.status(statusCode || 500).json({
          error: `Failed to fetch media: ${errDetail.message || officialError.message}`,
          code: errDetail.code,
          igErrorType: errDetail.type
        });
      }
    }

    // Legacy session-based path (Puppeteer accounts)
    if (!account.sessionCookies) {
      return res.status(400).json({ error: 'Account session not available. Please reconnect.' });
    }

    // Fetch media from Instagram (legacy)
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
