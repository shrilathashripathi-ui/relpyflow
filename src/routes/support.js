const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { protect } = require('../middleware/auth');

// Admin email — messages from this user are marked as admin replies
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'shrilathashripathi@gmail.com';

// GET /api/support/messages — get chat history for logged-in user
router.get('/messages', protect, async (req, res) => {
  try {
    const messages = await prisma.supportMessage.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    // Mark unread admin messages as read
    await prisma.supportMessage.updateMany({
      where: { userId: req.user.id, fromAdmin: true, read: false },
      data: { read: true },
    });

    res.json({ messages });
  } catch (err) {
    console.error('Support messages error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// POST /api/support/messages — user sends a message
router.post('/messages', protect, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const msg = await prisma.supportMessage.create({
      data: {
        userId: req.user.id,
        message: message.trim().substring(0, 2000),
        fromAdmin: false,
      },
    });

    res.json({ message: msg });
  } catch (err) {
    console.error('Support send error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /api/support/unread — count of unread admin messages for badge
router.get('/unread', protect, async (req, res) => {
  try {
    const count = await prisma.supportMessage.count({
      where: { userId: req.user.id, fromAdmin: true, read: false },
    });
    res.json({ unread: count });
  } catch (err) {
    res.json({ unread: 0 });
  }
});

// ==========================================
// ADMIN ENDPOINTS (founder only)
// ==========================================

// Middleware: check if user is admin
const requireAdmin = async (req, res, next) => {
  if (req.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// GET /api/support/admin/conversations — list all users with messages
router.get('/admin/conversations', protect, requireAdmin, async (req, res) => {
  try {
    // Get all users who have sent messages, with latest message + unread count
    const conversations = await prisma.$queryRaw`
      SELECT
        u.id as "userId",
        u.name,
        u.email,
        COUNT(CASE WHEN sm.from_admin = false AND sm.read = false THEN 1 END)::int as "unreadCount",
        MAX(sm.created_at) as "lastMessageAt",
        (SELECT sm2.message FROM support_messages sm2
         WHERE sm2.user_id = u.id
         ORDER BY sm2.created_at DESC LIMIT 1) as "lastMessage"
      FROM users u
      INNER JOIN support_messages sm ON sm.user_id = u.id
      GROUP BY u.id, u.name, u.email
      ORDER BY MAX(sm.created_at) DESC
    `;

    res.json({ conversations });
  } catch (err) {
    console.error('Admin conversations error:', err.message);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// GET /api/support/admin/messages/:userId — get messages for a specific user
router.get('/admin/messages/:userId', protect, requireAdmin, async (req, res) => {
  try {
    const messages = await prisma.supportMessage.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'asc' },
    });

    // Mark user messages as read
    await prisma.supportMessage.updateMany({
      where: { userId: req.params.userId, fromAdmin: false, read: false },
      data: { read: true },
    });

    res.json({ messages });
  } catch (err) {
    console.error('Admin messages error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// POST /api/support/admin/messages/:userId — admin sends reply to user
router.post('/admin/messages/:userId', protect, requireAdmin, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const msg = await prisma.supportMessage.create({
      data: {
        userId: req.params.userId,
        message: message.trim().substring(0, 2000),
        fromAdmin: true,
      },
    });

    res.json({ message: msg });
  } catch (err) {
    console.error('Admin reply error:', err.message);
    res.status(500).json({ error: 'Failed to send reply' });
  }
});

module.exports = router;
