import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { CallbackPayload } from '../types/index.js';
import { addLog } from '../services/callback-store.js';

export const callbackRouter = Router();

/**
 * Generic callback endpoint: POST /api/callbacks/:campaignId
 *
 * HappyRobot workflows send call results here after each call.
 * The backend logs them for observability. All contact state
 * (retry count, status) is managed in HappyRobot + Google Sheets.
 */
callbackRouter.post('/:campaignId', async (req: Request, res: Response) => {
  if (env.callbackSecret) {
    const secret = req.headers['x-callback-secret'];
    if (secret !== env.callbackSecret) {
      res.status(401).json({ error: 'Invalid callback secret' });
      return;
    }
  }

  const campaignId = req.params.campaignId as string;
  const payload = req.body as CallbackPayload;

  if (!payload.phone_number || !payload.call_status) {
    res.status(400).json({ error: 'Missing required fields: phone_number, call_status' });
    return;
  }

  const objective = payload.active_objective ?? '';
  const completed = payload.objective_completed ?? payload.documentation_confirmed ?? false;

  console.log(
    `[${campaignId}] Callback: ${payload.phone_number} — ` +
    `status=${payload.call_status}, objective=${objective}, completed=${completed}`,
  );

  addLog({
    campaign_id: campaignId,
    phone_number: payload.phone_number,
    call_status: payload.call_status,
    call_connected: payload.call_connected ?? false,
    objective_completed: completed,
    needs_escalation: payload.needs_escalation ?? false,
    call_summary: payload.call_summary ?? '',
    received_at: new Date().toISOString(),
    merchant_uuid: payload.merchant_uuid ?? '',
    funnel_stage: payload.funnel_stage ?? '',
    active_objective: objective,
  });

  res.json({ success: true });
});
