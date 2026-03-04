function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3000),

  // Google Sheets
  googleSheetsId: required('GOOGLE_SHEETS_ID'),
  googleServiceAccountKey: required('GOOGLE_SERVICE_ACCOUNT_KEY'),
  googleSheetName: process.env.GOOGLE_SHEET_NAME ?? 'Contacts',

  // HappyRobot
  happyRobotWebhookUrl: required('HAPPYROBOT_WEBHOOK_URL'),
  happyRobotApiKey: process.env.HAPPYROBOT_API_KEY ?? '',

  // Retry config
  maxRetries: Number(process.env.MAX_RETRIES ?? 10),
  callTimezone: process.env.CALL_TIMEZONE ?? 'Europe/Madrid',
  /** Seconds to wait between triggering calls (rate limiting) */
  callDelaySeconds: Number(process.env.CALL_DELAY_SECONDS ?? 3),

  // Callback security
  callbackSecret: process.env.CALLBACK_SECRET ?? '',

  // Base URL for this backend (used to build callback URLs)
  baseUrl: required('BASE_URL'),
};
