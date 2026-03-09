import { Router, Request, Response } from 'express';

export const testByocRouter = Router();

const BYOC_WEBHOOK_URL = process.env.BYOC_WEBHOOK_URL
  ?? 'https://workflows.platform.happyrobot.ai/hooks/development/55uyjudd376x';

/**
 * POST /api/test-byoc
 *
 * Testing endpoint: triggers the BYOC workflow directly with
 * form data from the BYOC testing landing page.
 */
testByocRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body;

  if (!body.phone_number) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }

  const payload = {
    restaurant_name: body.restaurant_name || 'Test Restaurant',
    contact_name: body.contact_name || 'Test User',
    phone_number: body.phone_number,
    city_name: body.city_name || 'Madrid',
    language: body.language || 'ES',
    fulfillment_type: body.fulfillment_type || 'self_delivery',
    cancellation_rate: body.cancellation_rate || '4.2',
    L7D_onboarded_couriers: body.L7D_onboarded_couriers || '0',
    L7D_ot_share: body.L7D_ot_share || '15.3',
    L7D_byoc_orders: body.L7D_byoc_orders || '87',
    input_data: body.input_data || 'Test merchant',
  };

  try {
    const response = await fetch(BYOC_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => null);

    if (response.ok) {
      res.json({ success: true, message: 'BYOC call triggered', details: responseBody });
    } else {
      res.status(502).json({ error: `HappyRobot returned ${response.status}`, details: responseBody });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger BYOC call', details: String(error) });
  }
});
