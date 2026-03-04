import { CallbackLog } from '../types/index.js';

const MAX_LOGS = 500;
const logs: CallbackLog[] = [];

/** Append a callback to the in-memory ring buffer */
export function addLog(log: CallbackLog): void {
  logs.push(log);
  if (logs.length > MAX_LOGS) {
    logs.splice(0, logs.length - MAX_LOGS);
  }
}

/** Get recent callback logs, optionally filtered by campaign */
export function getLogs(campaignId?: string, limit = 50): CallbackLog[] {
  const filtered = campaignId
    ? logs.filter((l) => l.campaign_id === campaignId)
    : logs;
  return filtered.slice(-limit).reverse();
}

/** Get summary stats per campaign */
export function getStats(): Record<string, { total: number; byStatus: Record<string, number> }> {
  const stats: Record<string, { total: number; byStatus: Record<string, number> }> = {};

  for (const log of logs) {
    if (!stats[log.campaign_id]) {
      stats[log.campaign_id] = { total: 0, byStatus: {} };
    }
    stats[log.campaign_id].total++;
    stats[log.campaign_id].byStatus[log.call_status] =
      (stats[log.campaign_id].byStatus[log.call_status] ?? 0) + 1;
  }

  return stats;
}
