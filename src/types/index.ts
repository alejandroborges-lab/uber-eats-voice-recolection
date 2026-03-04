// ─── Campaign System ───────────────────────────────────────────────

/** A campaign defines a reusable outbound calling schedule */
export interface Campaign {
  id: string;
  name: string;
  /** HappyRobot webhook URL to trigger */
  webhookUrl: string;
  /** API key for HappyRobot webhook (if enhanced security is enabled) */
  apiKey?: string;
  /** Cron expressions for when to trigger (in campaign timezone) */
  cronSchedules: string[];
  /** IANA timezone (e.g., "Europe/Madrid") */
  timezone: string;
  /** Max call attempts per contact before giving up */
  maxRetries: number;
  /** Whether this campaign is active */
  enabled: boolean;
}

// ─── Payloads ──────────────────────────────────────────────────────

export type CallResult =
  | 'completed'
  | 'missed'
  | 'voicemail'
  | 'busy'
  | 'failed'
  | 'canceled';

/** Payload sent TO HappyRobot when triggering a campaign batch */
export interface TriggerPayload {
  campaign_id: string;
  campaign_name: string;
  triggered_at: string;
  callback_url: string;
  max_retries: number;
}

/** Payload HappyRobot sends back after a call finishes */
export interface CallbackPayload {
  campaign_id: string;
  phone_number: string;
  call_status: CallResult;
  documentation_confirmed?: boolean;
  call_summary?: string;
  merchant_sentiment?: string;
  attempt_number?: number;
  [key: string]: unknown;
}

// ─── Callback Log (in-memory ring buffer for observability) ────────

export interface CallbackLog {
  campaign_id: string;
  phone_number: string;
  call_status: CallResult;
  documentation_confirmed: boolean;
  call_summary: string;
  received_at: string;
}
