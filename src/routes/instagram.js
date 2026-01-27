const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Start OAuth
router.get('/auth', protect, (req, res) => {
  const authUrl = `https://api.instagram.com/oauth/authorize?client_id=${process.env.INSTAGRAM_CLIENT_ID}&redirect_uri=${process.env.INSTAGRAM_REDIRECT_URI}&scope=user_profile,user_media&response_type=code`;
  res.json({ authUrl });
});

// OAuth Callback
router.get('/callback', async (req, res) => {
  try {
    const { code } = req.query;

    // Exchange code for access token
    const tokenResponse = await axios.post(
      'https://api.instagram.com/oauth/access_token',
      new URLSearchParams({
        client_id: process.env.INSTAGRAM_CLIENT_ID,
        client_secret: process.env.INSTAGRAM_CLIENT_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
        code,
      })
    );

    const { access_token, user_id } = tokenResponse.data;

    // Get user info
    const userInfo = await axios.get(
      `https://graph.instagram.com/me?fields=id,username&access_token=${access_token}`
    );

    // Store in database (you'll need userId from JWT in production)
    // For now, redirect with token
    res.redirect(`http://localhost:3000/connect-success?token=${access_token}&userId=${user_id}&username=${userInfo.data.username}`);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save Instagram Account
router.post('/account', protect, async (req, res) => {
  try {
    const { accessToken, instagramUserId, username } = req.body;

    const account = await prisma.instagramAccount.create({
      data: {
        userId: req.user.id,
        instagramUserId,
        username,
        accessToken,
        status: 'ACTIVE',
      },
    });

    res.status(201).json({ account });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Connected Accounts
router.get('/accounts', protect, async (req, res) => {
  try {
    const accounts = await prisma.instagramAccount.findMany({
      where: { userId: req.user.id },
      select: {
        id: true,
        username: true,
        status: true,
        createdAt: true,
      },
    });

    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
