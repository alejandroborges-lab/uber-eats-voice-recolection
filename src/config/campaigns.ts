import { Campaign } from '../types/index.js';

/**
 * Campaign registry.
 *
 * Each campaign maps to a HappyRobot workflow that handles:
 *   - Reading contacts from Google Sheets (native connector)
 *   - Looping through eligible contacts
 *   - Making outbound calls
 *   - Extracting results with AI
 *   - Updating the Sheet with results
 *
 * This backend only handles WHEN to trigger each campaign
 * and receives callbacks with results for logging/observability.
 *
 * To add a new campaign: add an entry here and create the
 * corresponding workflow in HappyRobot.
 */
export const campaigns: Campaign[] = [
  {
    id: 'uber-eats-doc-collection',
    name: 'Uber Eats - Recoleccion de documentacion',
    webhookUrl: process.env.CAMPAIGN_UBER_EATS_DOCS_WEBHOOK_URL ?? '',
    apiKey: process.env.CAMPAIGN_UBER_EATS_DOCS_API_KEY,
    cronSchedules: [
      '30 11 * * *', // 11:30
      '30 18 * * *', // 18:30
      '0 19 * * *',  // 19:00
    ],
    timezone: 'Europe/Madrid',
    maxRetries: 10,
    enabled: true,
  },

  // ── Add more campaigns here ──────────────────────────────────
  // {
  //   id: 'uber-eats-menu-followup',
  //   name: 'Uber Eats - Seguimiento de menu',
  //   webhookUrl: process.env.CAMPAIGN_UBER_EATS_MENU_WEBHOOK_URL ?? '',
  //   cronSchedules: ['0 10 * * 1-5'],  // 10:00 weekdays
  //   timezone: 'Europe/Madrid',
  //   maxRetries: 5,
  //   enabled: false,
  // },
];

export function getCampaign(id: string): Campaign | undefined {
  return campaigns.find((c) => c.id === id);
}

export function getActiveCampaigns(): Campaign[] {
  return campaigns.filter((c) => c.enabled && c.webhookUrl);
}
