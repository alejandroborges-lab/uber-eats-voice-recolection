import { Router, Request, Response } from 'express';

export const testChurnRouter = Router();

const CHURN_WEBHOOK_URL = process.env.CHURN_WEBHOOK_URL
  ?? 'https://workflows.platform.happyrobot.ai/hooks/xn54m051ay3q';

/**
 * POST /api/test-churn
 *
 * Testing endpoint: triggers the Churn Recovery workflow directly.
 */
testChurnRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body;

  if (body.phone_number) {
    body.phone_number = body.phone_number.replace(/\s/g, '');
    if (!body.phone_number.startsWith('+')) body.phone_number = '+' + body.phone_number;
  }

  if (!body.phone_number) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }

  const payload = { ...body };

  try {
    const response = await fetch(CHURN_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => null);

    if (response.ok) {
      res.json({ success: true, message: 'Churn call triggered', details: responseBody });
    } else {
      res.status(502).json({ error: `HappyRobot returned ${response.status}`, details: responseBody });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger Churn call', details: String(error) });
  }
});
