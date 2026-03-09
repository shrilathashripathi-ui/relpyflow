const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

class User {
  static async create({ email, password }) {
    const passwordHash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        verificationToken,
        verificationTokenExpires,
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        createdAt: true
      }
    });
    
    return { user, verificationToken };
  }
  
  static async findByEmail(email) {
    return await prisma.user.findUnique({
      where: { email }
    });
  }
  
  static async findById(id) {
    return await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        createdAt: true
      }
    });
  }
  
  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }
  
  static async verifyEmail(token) {
    const user = await prisma.user.findFirst({
      where: {
        verificationToken: token,
        verificationTokenExpires: {
          gt: new Date()
        }
      }
    });
    
    if (!user) return null;
    
    return await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpires: null
      },
      select: {
        id: true,
        email: true,
        emailVerified: true
      }
    });
  }
  
  static async createResetToken(email) {
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) return null;
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpires
      }
    });
    
    return { user, resetToken };
  }
  
  static async resetPassword(token, newPassword) {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: {
          gt: new Date()
        }
      }
    });
    
    if (!user) return null;
    
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    return await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpires: null
      },
      select: {
        id: true,
        email: true
      }
    });
  }
  
  static async updateSubscription(userId, plan, status, endsAt) {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionPlan: plan,
        subscriptionStatus: status,
        subscriptionEndsAt: endsAt
      },
      select: {
        id: true,
        email: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true
      }
    });
  }
}

module.exports = User;