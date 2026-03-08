import { Campaign } from '../types/index.js';

/**
 * Campaign registry.
 *
 * Architecture: Dispatcher/Caller split.
 *
 * The backend triggers a Dispatcher workflow in HappyRobot that reads
 * eligible rows from Google Sheets and POSTs them back to the backend.
 * The backend then fans out individual Caller workflow triggers — one
 * per merchant — with all merchant data in the payload.
 *
 * This eliminates the problematic Loop node in HappyRobot and keeps
 * Google Sheets access entirely within HappyRobot (no service account needed).
 */
export const campaigns: Campaign[] = [
  {
    id: 'uber-eats-onboarding',
    name: 'Uber Eats - Onboarding (all use cases)',
    webhookUrl: process.env.CAMPAIGN_UBER_EATS_WEBHOOK_URL,
    dispatcherWebhookUrl: process.env.CAMPAIGN_UBER_EATS_DISPATCHER_WEBHOOK_URL ?? '',
    callerWebhookUrl: process.env.CAMPAIGN_UBER_EATS_CALLER_WEBHOOK_URL ?? '',
    apiKey: process.env.CAMPAIGN_UBER_EATS_API_KEY,
    cronSchedules: [
      '30 11 * * *', // 11:30
      '30 18 * * *', // 18:30
      '0 19 * * *',  // 19:00
    ],
    timezone: 'Europe/Madrid',
    maxRetries: 10,
    enabled: true,
    callerDelayMs: 3000,
  },
];

export function getCampaign(id: string): Campaign | undefined {
  return campaigns.find((c) => c.id === id);
}

export function getActiveCampaigns(): Campaign[] {
  return campaigns.filter((c) => c.enabled && c.dispatcherWebhookUrl && c.callerWebhookUrl);
}
