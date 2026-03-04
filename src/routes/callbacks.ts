import { Router, Request, Response } from 'express';
import { env } from '../config/env.js';
import { updateCallResult } from '../services/google-sheets.js';
import { CallbackPayload } from '../types/index.js';

export const callbackRouter = Router();

callbackRouter.post('/call-result', async (req: Request, res: Response) => {
  // Validate callback secret if configured
  if (env.callbackSecret) {
    const secret = req.headers['x-callback-secret'];
    if (secret !== env.callbackSecret) {
      res.status(401).json({ error: 'Invalid callback secret' });
      return;
    }
  }

  const payload = req.body as CallbackPayload;

  if (!payload.phone_number || !payload.call_status) {
    res.status(400).json({ error: 'Missing required fields: phone_number, call_status' });
    return;
  }

  console.log(
    `Callback received: ${payload.phone_number} - status=${payload.call_status}, docs_confirmed=${payload.documentation_confirmed}`,
  );

  try {
    await updateCallResult(
      payload.phone_number,
      payload.call_status,
      payload.documentation_confirmed ?? false,
      payload.call_summary ?? '',
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to process callback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
