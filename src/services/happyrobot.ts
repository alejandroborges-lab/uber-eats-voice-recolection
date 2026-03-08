import {
  Campaign,
  TriggerPayload,
  DispatcherTriggerPayload,
  CallerTriggerPayload,
  MerchantRow,
} from '../types/index.js';
import { env } from '../config/env.js';

/** Build standard auth headers for HappyRobot webhooks */
function buildHeaders(campaign: Campaign): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (campaign.apiKey) {
    headers['Authorization'] = `Bearer ${campaign.apiKey}`;
  }
  return headers;
}

/**
 * (Legacy) Trigger a single HappyRobot workflow with Loop.
 * Kept for future use if the Loop/iteration_element issue is fixed.
 */
export async function triggerCampaign(
  campaign: Campaign,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  if (!campaign.webhookUrl) {
    console.warn(`[${campaign.id}] No legacy webhookUrl configured — skipping`);
    return { ok: false, status: 0, body: { error: 'No webhookUrl' } };
  }

  const payload: TriggerPayload = {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    triggered_at: new Date().toISOString(),
    callback_url: `${env.baseUrl}/api/callbacks/${campaign.id}`,
    max_retries: campaign.maxRetries,
  };

  const response = await fetch(campaign.webhookUrl, {
    method: 'POST',
    headers: buildHeaders(campaign),
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    console.error(`[${campaign.id}] Legacy webhook failed: ${response.status}`, body);
  } else {
    console.log(`[${campaign.id}] Legacy webhook triggered successfully`);
  }

  return { ok: response.ok, status: response.status, body };
}

/**
 * Trigger the Dispatcher workflow.
 * Tells HappyRobot to read Google Sheets and POST eligible rows
 * back to our /api/dispatch/:campaignId endpoint.
 */
export async function triggerDispatcher(
  campaign: Campaign,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const payload: DispatcherTriggerPayload = {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    triggered_at: new Date().toISOString(),
    dispatch_url: `${env.baseUrl}/api/dispatch/${campaign.id}`,
    max_retries: campaign.maxRetries,
  };

  const response = await fetch(campaign.dispatcherWebhookUrl, {
    method: 'POST',
    headers: buildHeaders(campaign),
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    console.error(`[${campaign.id}] Dispatcher webhook failed: ${response.status}`, body);
  } else {
    console.log(`[${campaign.id}] Dispatcher webhook triggered successfully`);
  }

  return { ok: response.ok, status: response.status, body };
}

/**
 * Trigger the Caller workflow for a single merchant.
 * ALL merchant data is sent as top-level fields — no iteration_element needed.
 */
export async function triggerCaller(
  campaign: Campaign,
  row: MerchantRow,
): Promise<{ ok: boolean; status: number; body: unknown; merchant_uuid: string }> {
  const payload: CallerTriggerPayload = {
    // Campaign metadata
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    triggered_at: new Date().toISOString(),
    callback_url: `${env.baseUrl}/api/callbacks/${campaign.id}`,
    max_retries: campaign.maxRetries,
    // Spread all merchant data
    ...row,
  };

  const response = await fetch(campaign.callerWebhookUrl, {
    method: 'POST',
    headers: buildHeaders(campaign),
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    console.error(
      `[${campaign.id}] Caller trigger failed for ${row.merchant_uuid}: ${response.status}`,
      body,
    );
  } else {
    console.log(
      `[${campaign.id}] Caller triggered for ${row.merchant_uuid} (${row.active_objective})`,
    );
  }

  return { ok: response.ok, status: response.status, body, merchant_uuid: row.merchant_uuid };
}
