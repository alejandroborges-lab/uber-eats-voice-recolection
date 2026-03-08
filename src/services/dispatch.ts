import { Campaign, MerchantRow, DispatchLog } from '../types/index.js';
import { triggerCaller } from './happyrobot.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── In-memory dispatch logs (ring buffer) ────────────────────────

const MAX_DISPATCH_LOGS = 100;
const dispatchLogs: DispatchLog[] = [];

function addDispatchLog(log: DispatchLog): void {
  dispatchLogs.push(log);
  if (dispatchLogs.length > MAX_DISPATCH_LOGS) {
    dispatchLogs.splice(0, dispatchLogs.length - MAX_DISPATCH_LOGS);
  }
}

export function getDispatchLogs(campaignId?: string, limit = 20): DispatchLog[] {
  const filtered = campaignId
    ? dispatchLogs.filter((l) => l.campaign_id === campaignId)
    : dispatchLogs;
  return filtered.slice(-limit).reverse();
}

// ─── Fan-out logic ────────────────────────────────────────────────

/**
 * Trigger the Caller workflow for each merchant row, with configurable
 * delay between calls. Each merchant is independent: if one fails,
 * the rest continue.
 */
export async function fanOutCallers(
  campaign: Campaign,
  rows: MerchantRow[],
): Promise<DispatchLog> {
  const log: DispatchLog = {
    campaign_id: campaign.id,
    dispatched_at: new Date().toISOString(),
    total_rows: rows.length,
    triggered_count: 0,
    failed_count: 0,
    skipped_count: 0,
    errors: [],
  };

  console.log(`[${campaign.id}] Fan-out: ${rows.length} merchants to call`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!row.contact_phone || !row.merchant_uuid) {
      console.warn(
        `[${campaign.id}] Skipping row ${i}: missing contact_phone or merchant_uuid`,
      );
      log.skipped_count++;
      continue;
    }

    try {
      const result = await triggerCaller(campaign, row);
      if (result.ok) {
        log.triggered_count++;
      } else {
        log.failed_count++;
        log.errors.push({
          merchant_uuid: row.merchant_uuid,
          error: `HTTP ${result.status}`,
        });
      }
    } catch (error) {
      log.failed_count++;
      log.errors.push({
        merchant_uuid: row.merchant_uuid,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(
        `[${campaign.id}] Error triggering caller for ${row.merchant_uuid}:`,
        error,
      );
    }

    // Delay between calls (skip after last one)
    if (i < rows.length - 1 && campaign.callerDelayMs > 0) {
      await sleep(campaign.callerDelayMs);
    }
  }

  console.log(
    `[${campaign.id}] Fan-out complete: ` +
      `${log.triggered_count} triggered, ${log.failed_count} failed, ${log.skipped_count} skipped`,
  );

  addDispatchLog(log);
  return log;
}
