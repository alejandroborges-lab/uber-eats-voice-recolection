import { env } from '../config/env.js';
import { HappyRobotPayload } from '../types/index.js';

/** Trigger an outbound call via HappyRobot webhook */
export async function triggerOutboundCall(
  payload: HappyRobotPayload,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (env.happyRobotApiKey) {
    headers['Authorization'] = `Bearer ${env.happyRobotApiKey}`;
  }

  const response = await fetch(env.happyRobotWebhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    console.error(
      `HappyRobot webhook failed: ${response.status}`,
      body,
    );
  }

  return { ok: response.ok, status: response.status, body };
}
