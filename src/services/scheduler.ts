import cron from 'node-cron';
import { env } from '../config/env.js';
import { getEligibleContacts, markCallTriggered } from './google-sheets.js';
import { triggerOutboundCall } from './happyrobot.js';
import { HappyRobotPayload } from '../types/index.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Process all eligible contacts: trigger outbound calls via HappyRobot */
export async function processCallBatch(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Starting call batch...`);

  const contacts = await getEligibleContacts();
  console.log(`Found ${contacts.length} eligible contacts`);

  if (contacts.length === 0) return;

  for (const contact of contacts) {
    const { data, rowIndex } = contact;
    const newAttemptCount = data.attempt_count + 1;

    const payload: HappyRobotPayload = {
      phone_number: data.phone_number,
      merchant_name: data.merchant_name,
      contact_name: data.contact_name,
      razon_social: data.razon_social,
      pending_documents: data.pending_documents,
      attempt_number: newAttemptCount,
      callback_url: `${env.baseUrl}/api/callbacks/call-result`,
    };

    console.log(
      `Triggering call to ${data.contact_name} (${data.phone_number}) - attempt #${newAttemptCount}`,
    );

    const result = await triggerOutboundCall(payload);

    if (result.ok) {
      await markCallTriggered(rowIndex, newAttemptCount);
      console.log(`  -> Call triggered successfully`);
    } else {
      console.error(
        `  -> Failed to trigger call: ${result.status}`,
        result.body,
      );
    }

    // Rate limiting: wait between calls to respect HappyRobot concurrency
    if (contacts.indexOf(contact) < contacts.length - 1) {
      await sleep(env.callDelaySeconds * 1000);
    }
  }

  console.log(`[${new Date().toISOString()}] Call batch complete.`);
}

/** Register cron jobs for call scheduling */
export function startScheduler(): void {
  const tz = env.callTimezone;

  // 11:30 every day
  cron.schedule('30 11 * * *', () => {
    processCallBatch().catch(console.error);
  }, { timezone: tz });

  // 18:30 every day
  cron.schedule('30 18 * * *', () => {
    processCallBatch().catch(console.error);
  }, { timezone: tz });

  // 19:00 every day
  cron.schedule('0 19 * * *', () => {
    processCallBatch().catch(console.error);
  }, { timezone: tz });

  console.log(`Scheduler started with timezone: ${tz}`);
  console.log('Cron jobs: 11:30, 18:30, 19:00');
}
