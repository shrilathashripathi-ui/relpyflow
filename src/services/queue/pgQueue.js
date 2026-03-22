/**
 * PostgreSQL-backed Job Queue
 *
 * Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent dequeuing.
 * Two job types: "poll_account" and "send_dm"
 *
 * Designed so swapping to BullMQ/Redis later requires only changing this file.
 */

const prisma = require('../../config/prisma');
const crypto = require('crypto');

const WORKER_ID = `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;

/**
 * Add a job to the queue
 */
async function enqueue(jobType, payload, options = {}) {
  const { groupKey = null, runAt = new Date(), maxAttempts = 3 } = options;

  // Idempotency: don't enqueue if a pending/processing job already exists for this group+type
  if (groupKey) {
    const existing = await prisma.jobQueue.findFirst({
      where: {
        jobType,
        groupKey,
        status: { in: ['pending', 'processing'] }
      }
    });
    if (existing) return existing;
  }

  return prisma.jobQueue.create({
    data: { jobType, groupKey, payload, runAt, maxAttempts, status: 'pending' }
  });
}

/**
 * Dequeue one job — atomic, concurrent-safe via raw SQL with SKIP LOCKED
 */
async function dequeueOne(jobType) {
  const result = await prisma.$queryRaw`
    UPDATE job_queue
    SET status = 'processing',
        locked_by = ${WORKER_ID},
        locked_at = NOW(),
        attempts = attempts + 1
    WHERE id = (
      SELECT jq.id FROM job_queue jq
      WHERE jq.status = 'pending'
        AND jq.run_at <= NOW()
        AND jq.job_type = ${jobType}
        AND NOT EXISTS (
          SELECT 1 FROM job_queue jq2
          WHERE jq2.group_key = jq.group_key
            AND jq2.group_key IS NOT NULL
            AND jq2.status = 'processing'
            AND jq2.id != jq.id
        )
      ORDER BY jq.run_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `;

  return result.length > 0 ? result[0] : null;
}

/**
 * Mark job as completed
 */
async function complete(jobId, result = null) {
  await prisma.jobQueue.update({
    where: { id: jobId },
    data: { status: 'completed', completedAt: new Date() }
  });
}

/**
 * Mark job as failed — retry with exponential backoff if attempts < maxAttempts
 */
async function fail(jobId, error, maxAttempts = 3) {
  const job = await prisma.jobQueue.findUnique({ where: { id: jobId } });
  if (!job) return;

  if (job.attempts >= maxAttempts) {
    await prisma.jobQueue.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        lastError: String(error).substring(0, 500),
        lockedBy: null,
        lockedAt: null
      }
    });
  } else {
    // Exponential backoff: 30s, 60s, 120s, ...
    const backoffMs = Math.min(30000 * Math.pow(2, job.attempts - 1), 300000);
    await prisma.jobQueue.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        lastError: String(error).substring(0, 500),
        runAt: new Date(Date.now() + backoffMs),
        lockedBy: null,
        lockedAt: null
      }
    });
  }
}

/**
 * Recover stale jobs (stuck in processing for > threshold)
 */
async function recoverStale(thresholdMs = 600000) {
  const cutoff = new Date(Date.now() - thresholdMs);
  const result = await prisma.jobQueue.updateMany({
    where: {
      status: 'processing',
      lockedAt: { lt: cutoff }
    },
    data: {
      status: 'pending',
      lockedBy: null,
      lockedAt: null,
      lastError: 'Recovered from stale lock'
    }
  });
  if (result.count > 0) {
    console.log(`🔧 [Queue] Recovered ${result.count} stale jobs`);
  }
}

/**
 * Clean up old completed/failed jobs
 */
async function cleanup(olderThanMs = 86400000) {
  const cutoff = new Date(Date.now() - olderThanMs);
  await prisma.jobQueue.deleteMany({
    where: {
      status: { in: ['completed', 'failed'] },
      createdAt: { lt: cutoff }
    }
  });
}

/**
 * Cancel all pending jobs for a group (e.g., when automation disabled)
 */
async function cancelByGroup(groupKey) {
  await prisma.jobQueue.updateMany({
    where: { groupKey, status: 'pending' },
    data: { status: 'failed', lastError: 'Cancelled' }
  });
}

/**
 * Get queue stats for monitoring
 */
async function stats() {
  const [pending, processing, failed] = await Promise.all([
    prisma.jobQueue.count({ where: { status: 'pending' } }),
    prisma.jobQueue.count({ where: { status: 'processing' } }),
    prisma.jobQueue.count({ where: { status: 'failed' } }),
  ]);
  return { pending, processing, failed, workerId: WORKER_ID };
}

module.exports = {
  enqueue,
  dequeueOne,
  complete,
  fail,
  recoverStale,
  cleanup,
  cancelByGroup,
  stats,
  WORKER_ID
};
