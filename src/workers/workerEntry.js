/**
 * Dedicated worker process entry point.
 *
 * Runs: commentPoller, dmQueueWorker, dmConversationHandler
 * No Express. No port binding. No API routes.
 *
 * DigitalOcean App Platform:
 *   Type: Worker
 *   Run command: node src/workers/workerEntry.js
 */
require('dotenv').config();

// Structured logging: override console → Pino (same as server.js)
const logger = require('../utils/logger');
logger.overrideConsole();

const { PrismaClient } = require('@prisma/client');

const commentPoller = require('../services/instagram/commentPoller');
const dmQueueWorker = require('../services/dmQueueWorker');
const dmConversationHandler = require('../services/dmConversationHandler');
const healthSnapshotWorker = require('../services/healthSnapshotWorker');

const prisma = new PrismaClient();

async function bootstrap() {
  console.log('============================================================');
  console.log('  ReplyFlow Worker Process');
  console.log(`  ${new Date().toISOString()}`);
  console.log(`  PID: ${process.pid}`);
  console.log('============================================================\n');

  // Verify DB connectivity before starting workers
  try {
    await prisma.$connect();
    const count = await prisma.instagramAccount.count();
    console.log(`✅ Database connected (${count} Instagram account(s))\n`);
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }

  // Start all workers
  console.log('🤖 Starting workers...');
  commentPoller.start();
  dmQueueWorker.start();
  await dmConversationHandler.startConversationHandler();
  healthSnapshotWorker.start();

  console.log('\n✅ All workers running. Waiting for work...\n');
}

// ── Graceful shutdown ──
async function shutdown(signal) {
  console.log(`\n🛑 ${signal} received, shutting down workers...`);

  commentPoller.stop();
  dmQueueWorker.stop();
  dmConversationHandler.stopConversationHandler();
  healthSnapshotWorker.stop();

  await prisma.$disconnect();
  console.log('✅ Worker process shut down cleanly.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection in worker:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception in worker:', err);
  process.exit(1);
});

bootstrap().catch((err) => {
  console.error('❌ Worker bootstrap failed:', err);
  process.exit(1);
});
