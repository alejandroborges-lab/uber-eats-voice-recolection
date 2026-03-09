import { Router, Request, Response } from 'express';
import { getCampaign } from '../config/campaigns.js';
import { triggerCaller } from '../services/happyrobot.js';
import { MerchantRow } from '../types/index.js';

export const testCallRouter = Router();

/**
 * POST /api/test-call
 *
 * Testing endpoint: triggers the Caller workflow directly with
 * form data from the testing landing page. Bypasses the Dispatcher.
 */
testCallRouter.post('/', async (req: Request, res: Response) => {
  const campaign = getCampaign('uber-eats-onboarding');

  if (!campaign) {
    res.status(500).json({ error: 'Campaign not configured' });
    return;
  }

  const body = req.body;

  if (!body.contact_phone) {
    res.status(400).json({ error: 'Phone number is required' });
    return;
  }

  const row: MerchantRow = {
    merchant_uuid: body.merchant_uuid || 'test-' + Date.now(),
    merchant_name: body.merchant_name || 'Test Restaurant',
    contact_name: body.contact_name || 'Test User',
    contact_phone: body.contact_phone,
    country: body.country || 'ES',
    timezone: body.timezone || 'Europe/Madrid',
    ae_name: body.ae_name || 'Alex',
    ae_phone: body.ae_phone || '',
    ae_email: body.ae_email || '',
    active_objective: body.active_objective || 'Docs',
    status: 'pending',
    attempt_count: '0',
    razon_social: body.razon_social || '',
    alt_phone: body.contact_phone,
    whatsapp_optin: '',
    whatsapp_number: '',
    funnel_stage: '',
    stage_entry_date: '',
    last_activity_date: '',
    days_without_progress: '',
    ulogistics_delivery_date: '',
    pending_documents: body.pending_documents || '',
    contract_sent_date: '',
    tablet_credentials_email: body.tablet_credentials_email || '',
    tablet_credentials_password: body.tablet_credentials_password || '',
    current_ror: body.current_ror || '',
  };

  try {
    const result = await triggerCaller(campaign, row);
    if (result.ok) {
      res.json({ success: true, message: 'Call triggered', run_id: result.body });
    } else {
      res.status(502).json({ error: `HappyRobot returned ${result.status}`, details: result.body });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger call', details: String(error) });
  }
});
