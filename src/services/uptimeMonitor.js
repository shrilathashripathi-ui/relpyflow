/**
 * Uptime Monitor Service
 * Tracks system health, Instagram session status, and worker status
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class UptimeMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      lastCheck: null,
      healthChecks: [],
      sessionChecks: [],
      workerStatus: {
        commentPoller: false,
        dmQueueWorker: false,
        reminderProcessor: false
      },
      errors: []
    };

    this.maxHistorySize = 100;
    this.checkInterval = null;
  }

  /**
   * Start periodic monitoring
   */
  start(intervalMs = 60000) {
    console.log('📊 Starting uptime monitor...');

    // Run initial check
    this.runHealthCheck();

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthCheck();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('📊 Uptime monitor stopped');
  }

  /**
   * Run a health check
   */
  async runHealthCheck() {
    const check = {
      timestamp: new Date(),
      database: false,
      workers: { ...this.metrics.workerStatus },
      sessionStatus: {},
      errors: []
    };

    try {
      // Check database connection
      await prisma.$queryRaw`SELECT 1`;
      check.database = true;
    } catch (error) {
      check.errors.push(`Database: ${error.message}`);
    }

    try {
      // Check Instagram account sessions
      const accounts = await prisma.instagramAccount.findMany({
        where: { status: { not: 'deleted' } },
        select: {
          id: true,
          username: true,
          status: true,
          lastActivityAt: true,
          lastActionBlockAt: true
        }
      });

      check.sessionStatus = {
        total: accounts.length,
        active: accounts.filter(a => a.status === 'active').length,
        expired: accounts.filter(a => a.status === 'session_expired').length,
        blocked: accounts.filter(a => a.status === 'action_blocked').length
      };

      // Check for accounts needing attention
      const problematicAccounts = accounts.filter(a =>
        a.status === 'session_expired' || a.status === 'action_blocked'
      );

      if (problematicAccounts.length > 0) {
        check.errors.push(`${problematicAccounts.length} account(s) need attention`);
      }
    } catch (error) {
      check.errors.push(`Session check: ${error.message}`);
    }

    // Store check result
    this.metrics.lastCheck = check;
    this.metrics.healthChecks.unshift(check);

    // Trim history
    if (this.metrics.healthChecks.length > this.maxHistorySize) {
      this.metrics.healthChecks.pop();
    }

    // Log issues
    if (check.errors.length > 0) {
      console.warn('⚠️ Health check issues:', check.errors);
    }

    return check;
  }

  /**
   * Update worker status
   */
  setWorkerStatus(workerName, isRunning) {
    this.metrics.workerStatus[workerName] = isRunning;
  }

  /**
   * Record an error
   */
  recordError(source, message, severity = 'warning') {
    const error = {
      timestamp: new Date(),
      source,
      message,
      severity
    };

    this.metrics.errors.unshift(error);

    // Keep only recent errors
    if (this.metrics.errors.length > this.maxHistorySize) {
      this.metrics.errors.pop();
    }

    if (severity === 'critical') {
      console.error(`🚨 Critical error from ${source}: ${message}`);
    }
  }

  /**
   * Get current status summary
   */
  getStatus() {
    const uptime = Date.now() - this.metrics.startTime;
    const lastCheck = this.metrics.lastCheck;

    return {
      status: this.getOverallStatus(),
      uptime: {
        ms: uptime,
        formatted: this.formatUptime(uptime)
      },
      lastCheck: lastCheck?.timestamp || null,
      workers: this.metrics.workerStatus,
      database: lastCheck?.database || false,
      sessions: lastCheck?.sessionStatus || {},
      recentErrors: this.metrics.errors.slice(0, 10),
      healthHistory: this.metrics.healthChecks.slice(0, 10).map(h => ({
        timestamp: h.timestamp,
        healthy: h.database && h.errors.length === 0
      }))
    };
  }

  /**
   * Get overall health status
   */
  getOverallStatus() {
    const lastCheck = this.metrics.lastCheck;

    if (!lastCheck) return 'unknown';
    if (!lastCheck.database) return 'critical';
    if (lastCheck.errors.length > 0) return 'degraded';
    if (Object.values(this.metrics.workerStatus).every(s => s)) return 'healthy';

    return 'degraded';
  }

  /**
   * Format uptime duration
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  /**
   * Get metrics for dashboard
   */
  async getDetailedMetrics() {
    const status = this.getStatus();

    // Get additional metrics from database
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Today's stats
      const todayStats = await prisma.dailyAnalytics.aggregate({
        where: {
          date: today
        },
        _sum: {
          commentsDetected: true,
          dmsQueued: true,
          dmsSent: true,
          dmsFailed: true,
          actionBlocks: true
        }
      });

      // Queue status
      const queueStatus = await prisma.dmQueue.groupBy({
        by: ['status'],
        _count: true
      });

      // Recent triggers
      const recentTriggers = await prisma.trigger.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      });

      return {
        ...status,
        today: {
          commentsDetected: todayStats._sum.commentsDetected || 0,
          dmsQueued: todayStats._sum.dmsQueued || 0,
          dmsSent: todayStats._sum.dmsSent || 0,
          dmsFailed: todayStats._sum.dmsFailed || 0,
          actionBlocks: todayStats._sum.actionBlocks || 0
        },
        queue: queueStatus.reduce((acc, item) => {
          acc[item.status] = item._count;
          return acc;
        }, {}),
        triggers24h: recentTriggers
      };
    } catch (error) {
      return {
        ...status,
        metricsError: error.message
      };
    }
  }
}

// Export singleton
const uptimeMonitor = new UptimeMonitor();
module.exports = uptimeMonitor;
