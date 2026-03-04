import { Campaign, TriggerPayload } from '../types/index.js';
import { env } from '../config/env.js';

/** Trigger a campaign's HappyRobot workflow */
export async function triggerCampaign(
  campaign: Campaign,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (campaign.apiKey) {
    headers['Authorization'] = `Bearer ${campaign.apiKey}`;
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
    headers,
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    console.error(`[${campaign.id}] Webhook failed: ${response.status}`, body);
  } else {
    console.log(`[${campaign.id}] Webhook triggered successfully`);
  }

  return { ok: response.ok, status: response.status, body };
}
