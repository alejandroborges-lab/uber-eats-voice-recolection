import { Router, Request, Response } from 'express';

export const testAdsRouter = Router();

const ADS_WEBHOOK_URL = process.env.ADS_WEBHOOK_URL
  ?? 'https://workflows.platform.happyrobot.ai/hooks/staging/yztl7zg5pxvn';

/**
 * POST /api/test-ads
 *
 * Testing endpoint: triggers the Ads & Offers workflow with
 * merchant data from the testing landing page.
 * Payload is sent wrapped in a { merchant: { ... } } object.
 */
testAdsRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body;

  if (!body.merchant) {
    res.status(400).json({ error: 'Missing merchant object' });
    return;
  }

  // Handle both array and object merchant formats
  let merchant = body.merchant;
  if (Array.isArray(merchant)) {
    merchant = merchant[0];
    if (!merchant) {
      res.status(400).json({ error: 'Empty merchant array' });
      return;
    }
  }

  // Sanitize phone
  if (merchant.primary_contact_phone) {
    merchant.primary_contact_phone = merchant.primary_contact_phone.replace(/\s/g, '').replace(/^\+/, '');
  }

  const payload = { merchant: Array.isArray(body.merchant) ? [merchant] : merchant };

  try {
    const response = await fetch(ADS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => null);

    if (response.ok) {
      res.json({ success: true, message: 'Ads call triggered', details: responseBody });
    } else {
      res.status(502).json({ error: `HappyRobot returned ${response.status}`, details: responseBody });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger Ads call', details: String(error) });
  }
});
