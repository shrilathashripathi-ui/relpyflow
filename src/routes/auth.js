const express = require('express');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../utils/jwt');
const { protect } = require('../middleware/auth');
const { sendOTP, generateOTP } = require('../services/emailService');

const router = express.Router();
const prisma = require('../config/prisma');

// Register — creates user, sends OTP, does NOT return auth token yet
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        phone: phone || null,
        emailVerified: false,
        verificationToken: otp,
        verificationTokenExpires: otpExpiry,
      },
      select: { id: true, email: true, name: true, phone: true },
    });

    // Send OTP email
    try {
      await sendOTP(email, otp);
    } catch (emailErr) {
      console.error('Failed to send OTP email:', emailErr.message);
      // Still return success — user can request resend
    }

    res.status(201).json({
      requiresVerification: true,
      email: user.email,
      message: 'Account created. Please verify your email with the OTP sent.',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify OTP — validates code, returns auth token on success
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      const token = generateToken(user.id);
      return res.json({
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
        token,
      });
    }

    if (user.verificationToken !== otp) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Mark email as verified
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpires: null,
      },
      select: { id: true, email: true, name: true, phone: true },
    });

    const token = generateToken(updatedUser.id);

    res.json({
      user: updatedUser,
      token,
      message: 'Email verified successfully',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.emailVerified) {
      return res.json({ message: 'Email already verified' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: otp,
        verificationTokenExpires: otpExpiry,
      },
    });

    await sendOTP(email, otp);

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login — if email not verified, resend OTP and prompt verification
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // If email not verified, send OTP and ask for verification
    if (!user.emailVerified) {
      const otp = generateOTP();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: otp,
          verificationTokenExpires: otpExpiry,
        },
      });

      try {
        await sendOTP(email, otp);
      } catch (emailErr) {
        console.error('Failed to send OTP on login:', emailErr.message);
      }

      return res.status(403).json({
        requiresVerification: true,
        email: user.email,
        message: 'Please verify your email. A new OTP has been sent.',
      });
    }

    const token = generateToken(user.id);

    res.json({
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
      token,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Profile
router.get('/profile', protect, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true,
      },
    });

    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
