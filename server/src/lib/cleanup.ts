/**
 * Periodic background cleanup of stale data.
 *
 * Currently handles:
 *   - AiQuery rows older than AI_QUERY_RETENTION_DAYS (default 30) —
 *     prevents the table from growing forever as the demo accumulates use.
 *
 * Runs once at server boot and then on a setInterval. No external cron
 * needed; appropriate for a single-process node deployment.
 */
import { prisma } from "../db.js";
import { config } from "../config.js";

let started = false;

async function runCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - config.aiQueryRetentionDays * 86_400_000);
  try {
    const result = await prisma.aiQuery.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      console.log(`[cleanup] removed ${result.count} AiQuery rows older than ${config.aiQueryRetentionDays}d`);
    }
  } catch (e) {
    console.error("[cleanup] AiQuery purge failed:", (e as Error).message);
  }
}

/**
 * Start the cleanup loop. Safe to call multiple times — internal flag
 * prevents double-scheduling.
 */
export function startCleanup() {
  if (started) return;
  started = true;
  // Initial pass after a short delay (don't block server startup)
  setTimeout(runCleanup, 10_000);
  // Recurring every CLEANUP_INTERVAL_HOURS hours
  setInterval(runCleanup, config.cleanupIntervalHours * 60 * 60 * 1000);
}
