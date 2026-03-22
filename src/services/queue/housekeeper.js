/**
 * Housekeeper
 *
 * Periodic maintenance for the job queue:
 * - Recover stale jobs (stuck in processing > 10 min)
 * - Clean up old completed/failed jobs (> 24 hours)
 * - Log queue stats
 *
 * Runs every 5 minutes.
 */

const queue = require('./pgQueue');

let timer = null;

async function run() {
  try {
    await queue.recoverStale(600000);    // 10 minutes
    await queue.cleanup(86400000);       // 24 hours

    const s = await queue.stats();
    if (s.pending > 0 || s.processing > 0) {
      console.log(`🧹 [Housekeeper] Queue: ${s.pending} pending, ${s.processing} processing, ${s.failed} failed`);
    }
  } catch (err) {
    console.error('❌ [Housekeeper] Error:', err.message);
  }
}

function start() {
  console.log('🧹 [Housekeeper] Started (every 5 min)');
  timer = setInterval(run, 300000);
  setTimeout(run, 60000); // First run after 1 minute
}

function stop() {
  if (timer) clearInterval(timer);
}

module.exports = { start, stop, run };
