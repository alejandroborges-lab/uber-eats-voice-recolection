// ─── Campaign System ───────────────────────────────────────────────

/** A campaign defines a reusable outbound calling schedule */
export interface Campaign {
  id: string;
  name: string;
  /** (Legacy) Single HappyRobot workflow with Loop — kept for future use if Loop is fixed */
  webhookUrl?: string;
  /** HappyRobot Dispatcher workflow webhook URL (reads Sheet, returns rows) */
  dispatcherWebhookUrl: string;
  /** HappyRobot Caller workflow webhook URL (calls one merchant) */
  callerWebhookUrl: string;
  /** API key for HappyRobot webhooks (if enhanced security is enabled) */
  apiKey?: string;
  /** Cron expressions for when to trigger (in campaign timezone) */
  cronSchedules: string[];
  /** IANA timezone (e.g., "Europe/Madrid") */
  timezone: string;
  /** Max call attempts per contact before giving up */
  maxRetries: number;
  /** Whether this campaign is active */
  enabled: boolean;
  /** Delay in ms between individual caller triggers (rate limiting) */
  callerDelayMs: number;
}

// ─── Merchant Row (from Google Sheets via Dispatcher) ─────────────

/** A single merchant row as returned by the Dispatcher workflow */
export interface MerchantRow {
  merchant_uuid: string;
  merchant_name: string;
  contact_name: string;
  contact_phone: string;
  country: string;
  timezone: string;
  ae_name: string;
  ae_phone: string;
  ae_email: string;
  active_objective: string;
  status: string;
  attempt_count: string;
  [key: string]: unknown;
}

// ─── Payloads ──────────────────────────────────────────────────────

export type CallResult =
  | 'completed'
  | 'missed'
  | 'voicemail'
  | 'busy'
  | 'failed'
  | 'canceled';

/** (Legacy) Payload sent TO HappyRobot single-workflow with Loop */
export interface TriggerPayload {
  campaign_id: string;
  campaign_name: string;
  triggered_at: string;
  callback_url: string;
  max_retries: number;
}

/** Payload sent TO HappyRobot Dispatcher workflow to initiate Sheet read */
export interface DispatcherTriggerPayload {
  campaign_id: string;
  campaign_name: string;
  triggered_at: string;
  /** URL for Dispatcher to POST rows back to */
  dispatch_url: string;
  max_retries: number;
}

/** Payload the Dispatcher workflow sends back to the backend */
export interface DispatchPayload {
  rows: MerchantRow[];
}

/** Payload sent TO HappyRobot Caller workflow for a single merchant */
export interface CallerTriggerPayload extends MerchantRow {
  campaign_id: string;
  campaign_name: string;
  triggered_at: string;
  callback_url: string;
  max_retries: number;
}

/** Payload HappyRobot Caller sends back after a call finishes */
export interface CallbackPayload {
  campaign_id: string;
  phone_number: string;
  call_status: CallResult;
  call_summary?: string;
  merchant_sentiment?: string;
  attempt_number?: number;
  // Merchant identification
  merchant_uuid?: string;
  funnel_stage?: string;
  active_objective?: string;
  // Call connection
  call_connected?: boolean;
  // Universal completion fields
  objective_completed?: boolean;
  needs_escalation?: boolean;
  escalation_reason?: string;
  // UC-specific fields (populated only for the relevant use case)
  documentation_confirmed?: boolean;
  contract_signed?: boolean;
  tablet_activated?: boolean;
  ror_issue_category?: string;
  [key: string]: unknown;
}

// ─── Callback Log (in-memory ring buffer for observability) ────────

export interface CallbackLog {
  campaign_id: string;
  phone_number: string;
  call_status: CallResult;
  call_connected: boolean;
  objective_completed: boolean;
  needs_escalation: boolean;
  call_summary: string;
  received_at: string;
  // Merchant identification
  merchant_uuid: string;
  // Funnel state
  funnel_stage: string;
  active_objective: string;
}

// ─── Dispatch Log (observability for fan-out cycles) ──────────────

export interface DispatchLog {
  campaign_id: string;
  dispatched_at: string;
  total_rows: number;
  triggered_count: number;
  failed_count: number;
  skipped_count: number;
  errors: Array<{ merchant_uuid: string; error: string }>;
}
