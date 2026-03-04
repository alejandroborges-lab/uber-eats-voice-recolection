export interface MerchantContact {
  merchant_name: string;
  contact_name: string;
  phone_number: string;
  razon_social: string;
  pending_documents: string;
  status: ContactStatus;
  attempt_count: number;
  last_call_date: string;
  last_call_result: CallResult | '';
  documentation_confirmed: boolean;
  call_summary: string;
  created_at: string;
  notes: string;
}

export type ContactStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'max_retries_reached'
  | 'do_not_call';

export type CallResult =
  | 'completed'
  | 'missed'
  | 'voicemail'
  | 'busy'
  | 'failed'
  | 'canceled';

export interface HappyRobotPayload {
  phone_number: string;
  merchant_name: string;
  contact_name: string;
  razon_social: string;
  pending_documents: string;
  attempt_number: number;
  callback_url: string;
}

export interface CallbackPayload {
  phone_number: string;
  call_status: CallResult;
  documentation_confirmed: boolean;
  call_summary: string;
  merchant_sentiment: string;
  attempt_number: number;
}

export interface SheetRow {
  rowIndex: number;
  data: MerchantContact;
}

/** Column mapping for the Google Sheet (0-indexed) */
export const SHEET_COLUMNS = {
  merchant_name: 0,
  contact_name: 1,
  phone_number: 2,
  razon_social: 3,
  pending_documents: 4,
  status: 5,
  attempt_count: 6,
  last_call_date: 7,
  last_call_result: 8,
  documentation_confirmed: 9,
  call_summary: 10,
  created_at: 11,
  notes: 12,
} as const;
