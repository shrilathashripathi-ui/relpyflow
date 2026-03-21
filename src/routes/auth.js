const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateToken } = require('../utils/jwt');
const { protect } = require('../middleware/auth');
const { sendOTP, generateOTP } = require('../services/emailService');
const { registerValidation, loginValidation } = require('../middleware/validation');
const { otpLimiter, registrationLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const prisma = require('../config/prisma');

// Hash OTP before storing (so DB compromise doesn't leak OTPs)
function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// Register — creates user, sends OTP, does NOT return auth token yet
router.post('/register', registrationLimiter, registerValidation, async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Validate name length
    if (name && name.length > 100) {
      return res.status(400).json({ error: 'Name is too long' });
    }
    if (phone && (phone.length > 20 || !/^[+\d\s()-]+$/.test(phone))) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      // Generic message to prevent email enumeration
      return res.status(400).json({ error: 'Unable to create account with this email' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name ? name.slice(0, 100) : null,
        phone: phone ? phone.slice(0, 20) : null,
        emailVerified: false,
        verificationToken: hashOTP(otp),
        verificationTokenExpires: otpExpiry,
      },
      select: { id: true, email: true, name: true, phone: true },
    });

    // Send OTP email
    try {
      await sendOTP(email, otp);
    } catch (emailErr) {
      console.error('Failed to send OTP email:', emailErr.message);
    }

    res.status(201).json({
      requiresVerification: true,
      email: user.email,
      message: 'Account created. Please verify your email with the OTP sent.',
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Verify OTP — validates code, returns auth token on success
router.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    // Validate OTP format (6 digits only)
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Invalid OTP format' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid verification request' });
    }

    if (user.emailVerified) {
      const token = generateToken(user.id);
      return res.json({
        user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
        token,
      });
    }

    // Compare hashed OTP
    if (user.verificationToken !== hashOTP(otp)) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Mark email as verified, clear OTP
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
    console.error('OTP verification error:', error.message);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// Resend OTP
router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Generic response to prevent email enumeration
      return res.json({ message: 'If an account exists, a new OTP has been sent' });
    }

    if (user.emailVerified) {
      return res.json({ message: 'Email already verified' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashOTP(otp),
        verificationTokenExpires: otpExpiry,
      },
    });

    await sendOTP(email, otp);

    res.json({ message: 'If an account exists, a new OTP has been sent' });
  } catch (error) {
    console.error('Resend OTP error:', error.message);
    res.status(500).json({ error: 'Failed to resend OTP. Please try again.' });
  }
});

// Forgot Password — sends OTP to email for password reset
router.post('/forgot-password', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If an account exists, a reset code has been sent' });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashOTP(otp),
        verificationTokenExpires: otpExpiry,
      },
    });

    try {
      await sendOTP(email, otp, 'reset');
    } catch (emailErr) {
      console.error('Failed to send reset OTP:', emailErr.message);
    }

    res.json({ message: 'If an account exists, a reset code has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Reset Password — verify OTP and set new password
router.post('/reset-password', otpLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Invalid OTP format' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid reset request' });
    }

    // Verify OTP
    if (user.verificationToken !== hashOTP(otp)) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }

    if (user.verificationTokenExpires && new Date() > user.verificationTokenExpires) {
      return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
    }

    // Update password and clear OTP
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        verificationToken: null,
        verificationTokenExpires: null,
        emailVerified: true, // If they can receive email, mark as verified
      },
    });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error.message);
    res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
});

// Login — if email not verified, resend OTP and prompt verification
router.post('/login', loginValidation, async (req, res) => {
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
          verificationToken: hashOTP(otp),
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
    console.error('Login error:', error.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
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
    console.error('Profile fetch error:', error.message);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;
