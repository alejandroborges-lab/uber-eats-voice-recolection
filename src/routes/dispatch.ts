import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { getCampaign } from '../config/campaigns.js';
import { DispatchPayload } from '../types/index.js';
import { fanOutCallers } from '../services/dispatch.js';

export const dispatchRouter = Router();

/**
 * POST /api/dispatch/:campaignId
 *
 * Called by the HappyRobot Dispatcher workflow with all eligible rows.
 * The backend fans out individual Caller triggers for each merchant.
 * Responds immediately (200) — fan-out runs in background.
 */
dispatchRouter.post('/:campaignId', async (req: Request, res: Response) => {
  if (env.dispatchSecret) {
    const secret = req.headers['x-dispatch-secret'] as string | undefined;
    if (secret !== env.dispatchSecret) {
      res.status(401).json({ error: 'Invalid dispatch secret' });
      return;
    }
  }

  const campaignId = req.params.campaignId as string;
  const campaign = getCampaign(campaignId);

  if (!campaign) {
    res.status(404).json({ error: `Campaign "${campaignId}" not found` });
    return;
  }

  const payload = req.body as DispatchPayload;

  // HappyRobot may send rows as a JSON string instead of an array — handle both
  let rows = payload.rows;
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows);
    } catch {
      res.status(400).json({ error: 'Invalid "rows" JSON string' });
      return;
    }
  }

  if (!rows || !Array.isArray(rows)) {
    res.status(400).json({ error: 'Missing or invalid "rows" array' });
    return;
  }

  console.log(`[${campaignId}] Dispatch received: ${rows.length} rows`);

  // Respond immediately — fan-out runs in background
  res.json({
    success: true,
    message: `Dispatch accepted: ${rows.length} merchants queued`,
    total_rows: rows.length,
  });

  // Fire-and-forget
  fanOutCallers(campaign, rows).catch((error) => {
    console.error(`[${campaignId}] Fan-out error:`, error);
  });
});
