const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Create Automation
router.post('/', protect, async (req, res) => {
  try {
    const { instagramAccountId, name, keywords, responseMessage } = req.body;

    const automation = await prisma.automation.create({
      data: {
        userId: req.user.id,
        instagramAccountId,
        name,
        keywords,
        responseMessage,
        isActive: true,
      },
    });

    res.status(201).json({ automation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Automations
router.get('/', protect, async (req, res) => {
  try {
    const automations = await prisma.automation.findMany({
      where: { userId: req.user.id },
      include: {
        instagramAccount: {
          select: { username: true },
        },
      },
    });

    res.json({ automations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle Automation
router.patch('/:id/toggle', protect, async (req, res) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!automation) {
      return res.status(404).json({ error: 'Automation not found' });
    }

    const updated = await prisma.automation.update({
      where: { id: req.params.id },
      data: { isActive: !automation.isActive },
    });

    res.json({ automation: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Triggers
router.get('/:id/triggers', protect, async (req, res) => {
  try {
    const triggers = await prisma.trigger.findMany({
      where: { automationId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ triggers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
