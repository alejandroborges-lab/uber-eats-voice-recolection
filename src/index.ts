import express from 'express';
import { env } from './config/env.js';
import { callbackRouter } from './routes/callbacks.js';
import { startScheduler, triggerCampaignManually } from './services/scheduler.js';
import { getActiveCampaigns } from './config/campaigns.js';
import { getLogs, getStats } from './services/callback-store.js';

const app = express();
app.use(express.json());

// ─── Health & Dashboard ────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    campaigns: getActiveCampaigns().map((c) => ({
      id: c.id,
      name: c.name,
      schedules: c.cronSchedules,
      timezone: c.timezone,
    })),
  });
});

app.get('/api/stats', (_req, res) => {
  res.json(getStats());
});

app.get('/api/logs', (req, res) => {
  const campaignId = req.query.campaign_id as string | undefined;
  const limit = Number(req.query.limit ?? 50);
  res.json(getLogs(campaignId, limit));
});

// ─── Callbacks (HappyRobot → Backend) ─────────────────────────────

app.use('/api/callbacks', callbackRouter);

// ─── Manual Trigger (for testing) ─────────────────────────────────

app.post('/api/trigger/:campaignId', async (req, res) => {
  if (env.callbackSecret) {
    const secret = req.headers['x-callback-secret'];
    if (secret !== env.callbackSecret) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const result = await triggerCampaignManually(req.params.campaignId);
  res.status(result.ok ? 200 : 404).json(result);
});

// ─── Start ─────────────────────────────────────────────────────────

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port}`);
  console.log(`Base URL: ${env.baseUrl}`);
  startScheduler();
});
