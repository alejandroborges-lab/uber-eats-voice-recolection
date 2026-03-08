import cron from 'node-cron';
import { getActiveCampaigns } from '../config/campaigns.js';
import { triggerDispatcher, triggerCampaign } from './happyrobot.js';
import { Campaign } from '../types/index.js';

/** Trigger a single campaign's dispatcher workflow */
async function runCampaign(campaign: Campaign): Promise<void> {
  console.log(
    `[${new Date().toISOString()}] [${campaign.id}] Cron fired — triggering dispatcher`,
  );

  try {
    await triggerDispatcher(campaign);
  } catch (error) {
    console.error(`[${campaign.id}] Failed to trigger dispatcher:`, error);
  }
}

/** Register all cron jobs for all active campaigns */
export function startScheduler(): void {
  const activeCampaigns = getActiveCampaigns();

  if (activeCampaigns.length === 0) {
    console.warn('No active campaigns found. Scheduler idle.');
    return;
  }

  for (const campaign of activeCampaigns) {
    for (const cronExpr of campaign.cronSchedules) {
      cron.schedule(
        cronExpr,
        () => { runCampaign(campaign).catch(console.error); },
        { timezone: campaign.timezone },
      );

      console.log(
        `  Scheduled "${campaign.name}" — cron: ${cronExpr} (${campaign.timezone})`,
      );
    }
  }

  console.log(
    `Scheduler started: ${activeCampaigns.length} campaign(s), ` +
    `${activeCampaigns.reduce((n, c) => n + c.cronSchedules.length, 0)} cron job(s)`,
  );
}

/** Manually trigger a campaign's dispatcher (for testing) */
export async function triggerCampaignManually(
  campaignId: string,
): Promise<{ ok: boolean; message: string }> {
  const campaign = getActiveCampaigns().find((c) => c.id === campaignId);

  if (!campaign) {
    return { ok: false, message: `Campaign "${campaignId}" not found or not active` };
  }

  runCampaign(campaign).catch(console.error);
  return { ok: true, message: `Campaign "${campaign.name}" dispatcher triggered` };
}

/** Manually trigger via legacy single-workflow with Loop (for testing) */
export async function triggerLegacyManually(
  campaignId: string,
): Promise<{ ok: boolean; message: string }> {
  const campaigns = getActiveCampaigns();
  const campaign = campaigns.find((c) => c.id === campaignId);

  if (!campaign) {
    return { ok: false, message: `Campaign "${campaignId}" not found or not active` };
  }

  if (!campaign.webhookUrl) {
    return { ok: false, message: `Campaign "${campaignId}" has no legacy webhookUrl` };
  }

  triggerCampaign(campaign).catch(console.error);
  return { ok: true, message: `Campaign "${campaign.name}" legacy workflow triggered` };
}
