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
  if (body.phone_number) {
    body.phone_number = body.phone_number.replace(/\s/g, '');
    if (!body.phone_number.startsWith('+')) body.phone_number = '+' + body.phone_number;
  }

  if (!body.phone_number) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }

  const payload = {
    restaurant_name: body.restaurant_name || 'Test Restaurant',
    contact_name: body.contact_name || 'Test User',
    phone_number: body.phone_number,
    city_name: body.city_name || 'Madrid',
    preferred_language: body.preferred_language || 'es',
    fulfillment_type: body.fulfillment_type || 'self_delivery',
    cancellation_rate: body.cancellation_rate || '4.2',
    L7D_onboarded_couriers: body.L7D_onboarded_couriers || '0',
    L7D_ot_share: body.L7D_ot_share || '15.3',
    L7D_byoc_orders: body.L7D_byoc_orders || '87',
    input_data: body.input_data || 'Test merchant',
    L30D_orders: body.L30D_orders || '320',
    L30D_ot_coverage: body.L30D_ot_coverage || '12',
    merchant_size_tier: body.merchant_size_tier || 'Large',
    merchant_ot_tier: body.merchant_ot_tier || 'Dabblers',
    ads_credit_reward: body.ads_credit_reward || '80',
    orders_for_90_pct: body.orders_for_90_pct || '288',
    cnfe_cancellations: body.cnfe_cancellations || '5',
    nro_chargebacks: body.nro_chargebacks || '3',
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
