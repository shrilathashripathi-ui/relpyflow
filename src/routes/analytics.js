/**
 * Analytics Routes - Dashboard metrics and reporting
 */

const express = require('express');
const { protect } = require('../middleware/auth');
const uptimeMonitor = require('../services/uptimeMonitor');

const router = express.Router();
const prisma = require('../config/prisma');

// Normalize DM status for frontend display.
// NEVER default to 'sent' — failed DMs must show as failed.
function normalizeDmStatus(rawStatus) {
  const statusMap = {
    sent: 'sent',
    failed: 'failed',
    permanent_failed: 'failed',
    blocked: 'failed',
    processing: 'sending',
    pending: 'pending',
    expired: 'expired',
    dropped: 'expired',
  };
  return statusMap[rawStatus] || 'unknown';
}

// Get overall dashboard metrics
router.get('/dashboard', protect, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's automations
    const automations = await prisma.automation.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        isActive: true,
        triggerCount: true,
        dmsSentCount: true,
        leadsCollected: true,
        instagramAccount: {
          select: { username: true, status: true }
        }
      }
    });

    // Calculate totals
    const totals = automations.reduce((acc, a) => ({
      triggers: acc.triggers + a.triggerCount,
      dmsSent: acc.dmsSent + a.dmsSentCount,
      leads: acc.leads + a.leadsCollected
    }), { triggers: 0, dmsSent: 0, leads: 0 });

    // Get today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const accounts = await prisma.instagramAccount.findMany({
      where: { userId },
      select: { id: true }
    });

    const accountIds = accounts.map(a => a.id);

    const todayStats = await prisma.dailyAnalytics.aggregate({
      where: {
        igAccountId: { in: accountIds },
        date: today
      },
      _sum: {
        commentsDetected: true,
        dmsQueued: true,
        dmsSent: true,
        dmsFailed: true
      }
    });

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const weeklyStats = await prisma.dailyAnalytics.findMany({
      where: {
        igAccountId: { in: accountIds },
        date: { gte: sevenDaysAgo }
      },
      orderBy: { date: 'asc' }
    });

    // Aggregate by date
    const dailyData = weeklyStats.reduce((acc, day) => {
      const dateKey = day.date.toISOString().split('T')[0];
      if (!acc[dateKey]) {
        acc[dateKey] = { date: dateKey, comments: 0, dmsSent: 0, leads: 0 };
      }
      acc[dateKey].comments += day.commentsDetected || 0;
      acc[dateKey].dmsSent += day.dmsSent || 0;
      return acc;
    }, {});

    // Get recent leads
    const recentLeads = await prisma.lead.findMany({
      where: {
        automation: { userId }
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: {
        automation: { select: { name: true } }
      }
    });

    // Get queue status
    const queueStatus = await prisma.dmQueue.groupBy({
      by: ['status'],
      where: {
        igAccountId: { in: accountIds }
      },
      _count: true
    });

    res.json({
      totals: {
        triggers: totals.triggers,
        dmsSent: totals.dmsSent,
        leads: totals.leads,
        activeAutomations: automations.filter(a => a.isActive).length,
        totalAutomations: automations.length
      },
      today: {
        comments: todayStats._sum.commentsDetected || 0,
        dmsQueued: todayStats._sum.dmsQueued || 0,
        dmsSent: todayStats._sum.dmsSent || 0,
        dmsFailed: todayStats._sum.dmsFailed || 0
      },
      weeklyChart: Object.values(dailyData),
      recentLeads: recentLeads.map(l => ({
        id: l.id,
        username: l.igUsername,
        email: l.email,
        name: l.name,
        automationName: l.automation.name,
        createdAt: l.createdAt
      })),
      queue: queueStatus.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {}),
      accounts: automations.map(a => ({
        username: a.instagramAccount.username,
        status: a.instagramAccount.status
      }))
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get system health status
router.get('/health', protect, async (req, res) => {
  try {
    const status = await uptimeMonitor.getDetailedMetrics();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Public health endpoint (for external monitoring)
router.get('/health/public', async (req, res) => {
  try {
    const status = uptimeMonitor.getStatus();
    res.json({
      status: status.status,
      uptime: status.uptime.formatted
    });
  } catch (error) {
    res.status(500).json({ status: 'error' });
  }
});

// Get leads report
router.get('/leads', protect, async (req, res) => {
  try {
    const { automationId, startDate, endDate, limit = 100 } = req.query;

    const where = {
      automation: { userId: req.user.id }
    };

    if (automationId) {
      where.automationId = automationId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: {
        automation: { select: { name: true } }
      }
    });

    res.json({
      total: leads.length,
      leads: leads.map(l => ({
        id: l.id,
        igUsername: l.igUsername,
        email: l.email,
        phone: l.phone,
        name: l.name,
        customData: l.customData,
        isComplete: l.isComplete,
        automationName: l.automation.name,
        createdAt: l.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export all leads as CSV
router.get('/leads/export', protect, async (req, res) => {
  try {
    const { automationId, startDate, endDate } = req.query;

    const where = {
      automation: { userId: req.user.id }
    };

    if (automationId) {
      where.automationId = automationId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        automation: { select: { name: true } }
      }
    });

    // Build CSV
    const headers = [
      'Instagram Username',
      'Email',
      'Phone',
      'Name',
      'Complete',
      'Automation',
      'Collected At'
    ];

    const rows = leads.map(lead => [
      lead.igUsername,
      lead.email || '',
      lead.phone || '',
      lead.name || '',
      lead.isComplete ? 'Yes' : 'No',
      lead.automation.name,
      new Date(lead.createdAt).toISOString()
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=leads-export-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get DM history
router.get('/dm-history', protect, async (req, res) => {
  try {
    const { accountId, status, limit = 50 } = req.query;

    const accounts = await prisma.instagramAccount.findMany({
      where: { userId: req.user.id },
      select: { id: true }
    });

    const accountIds = accounts.map(a => a.id);

    const where = {
      igAccountId: { in: accountIds }
    };

    if (accountId) {
      where.igAccountId = accountId;
    }

    if (status) {
      where.status = status;
    }

    const history = await prisma.dmHistory.findMany({
      where,
      orderBy: { dmSentAt: 'desc' },
      take: parseInt(limit),
      include: {
        igAccount: { select: { username: true } }
      }
    });

    res.json({
      total: history.length,
      history: history.map(h => ({
        id: h.id,
        recipientUsername: h.recipientUsername,
        messageSent: h.messageSent,
        commentText: h.commentText,
        detectedKeyword: h.detectedKeyword,
        status: normalizeDmStatus(h.status),
        accountUsername: h.igAccount.username,
        sentAt: h.dmSentAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversion funnel
router.get('/funnel', protect, async (req, res) => {
  try {
    const { automationId, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const where = automationId
      ? { automationId, createdAt: { gte: startDate } }
      : { automation: { userId: req.user.id }, createdAt: { gte: startDate } };

    // Get trigger counts by status
    const triggers = await prisma.trigger.groupBy({
      by: ['status'],
      where,
      _count: true
    });

    // Get lead counts
    const leads = await prisma.lead.count({
      where: {
        automation: { userId: req.user.id },
        createdAt: { gte: startDate }
      }
    });

    const completeLeads = await prisma.lead.count({
      where: {
        automation: { userId: req.user.id },
        isComplete: true,
        createdAt: { gte: startDate }
      }
    });

    // Build funnel
    const triggerCounts = triggers.reduce((acc, t) => {
      acc[t.status] = t._count;
      return acc;
    }, {});

    const totalTriggers = Object.values(triggerCounts).reduce((a, b) => a + b, 0);
    const dmsSent = triggerCounts.dm_sent || 0;

    res.json({
      funnel: [
        { stage: 'Comments Detected', count: totalTriggers, percentage: 100 },
        { stage: 'DMs Sent', count: dmsSent, percentage: totalTriggers > 0 ? Math.round(dmsSent / totalTriggers * 100) : 0 },
        { stage: 'Leads Started', count: leads, percentage: dmsSent > 0 ? Math.round(leads / dmsSent * 100) : 0 },
        { stage: 'Leads Complete', count: completeLeads, percentage: leads > 0 ? Math.round(completeLeads / leads * 100) : 0 }
      ],
      period: `Last ${days} days`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
