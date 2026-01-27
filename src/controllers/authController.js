const User = require('../models/User');
const { generateAuthTokens } = require('../utils/jwt');

class AuthController {
  async register(req, res) {
    try {
      const { email, password } = req.body;
      
      // Check if user already exists
      const existingUser = await User.findByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      
      // Create user
      const { user, verificationToken } = await User.create({ email, password });
      
      // Generate tokens
      const { accessToken, refreshToken } = generateAuthTokens(user);
      
      // Set cookies
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
      
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      // TODO: Send verification email with verificationToken
      console.log('Verification token:', verificationToken);
      
      res.status(201).json({
        message: 'Registration successful',
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.email_verified,
          subscriptionPlan: user.subscription_plan,
          trialEndsAt: user.trial_ends_at
        },
        accessToken
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ error: 'Registration failed' });
    }
  }
  
  async login(req, res) {
    try {
      const { email, password } = req.body;
      
      // Find user
      const user = await User.findByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Verify password
      const isValidPassword = await User.verifyPassword(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      // Generate tokens
      const { accessToken, refreshToken } = generateAuthTokens(user);
      
      // Set cookies
      res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });
      
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000
      });
      
      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.email_verified,
          subscriptionPlan: user.subscription_plan,
          subscriptionStatus: user.subscription_status,
          trialEndsAt: user.trial_ends_at
        },
        accessToken
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  }
  
  async logout(req, res) {
    try {
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');
      res.json({ message: 'Logout successful' });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  }
  
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;
      
      const user = await User.verifyEmail(token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired verification token' });
      }
      
      res.json({
        message: 'Email verified successfully',
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.email_verified
        }
      });
    } catch (error) {
      console.error('Verify email error:', error);
      res.status(500).json({ error: 'Email verification failed' });
    }
  }
  
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      
      const result = await User.createResetToken(email);
      if (!result) {
        // Don't reveal if email exists or not
        return res.json({ message: 'If email exists, reset link has been sent' });
      }
      
      // TODO: Send reset email with resetToken
      console.log('Reset token:', result.resetToken);
      
      res.json({ message: 'If email exists, reset link has been sent' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  }
  
  async resetPassword(req, res) {
    try {
      const { token, password } = req.body;
      
      const user = await User.resetPassword(token, password);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      
      res.json({ message: 'Password reset successful' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Password reset failed' });
    }
  }
  
  async getProfile(req, res) {
    try {
      res.json({
        user: {
          id: req.user.id,
          email: req.user.email,
          emailVerified: req.user.email_verified,
          subscriptionPlan: req.user.subscription_plan,
          subscriptionStatus: req.user.subscription_status,
          trialEndsAt: req.user.trial_ends_at,
          subscriptionEndsAt: req.user.subscription_ends_at,
          createdAt: req.user.created_at
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }
}

module.exports = new AuthController();