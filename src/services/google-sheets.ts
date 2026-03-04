import { google, sheets_v4 } from 'googleapis';
import { env } from '../config/env.js';
import { MerchantContact, SheetRow, SHEET_COLUMNS } from '../types/index.js';

let sheetsClient: sheets_v4.Sheets | null = null;

function getClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;

  const credentials = JSON.parse(env.googleServiceAccountKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/** Read all rows from the Contacts sheet (skipping header row) */
export async function getAllContacts(): Promise<SheetRow[]> {
  const sheets = getClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetsId,
    range: `${env.googleSheetName}!A2:M`,
  });

  const rows = response.data.values ?? [];
  return rows.map((row, index) => ({
    // rowIndex is 2-based (row 1 is header, row 2 is first data row)
    rowIndex: index + 2,
    data: parseRow(row),
  }));
}

/** Get contacts eligible for calling right now */
export async function getEligibleContacts(): Promise<SheetRow[]> {
  const all = await getAllContacts();
  return all.filter((row) => {
    const { status, attempt_count, documentation_confirmed } = row.data;
    return (
      (status === 'pending' || status === 'in_progress') &&
      attempt_count < env.maxRetries &&
      !documentation_confirmed
    );
  });
}

/** Update specific cells for a contact row after triggering a call */
export async function markCallTriggered(
  rowIndex: number,
  attemptCount: number,
): Promise<void> {
  const sheets = getClient();
  const now = new Date().toISOString();

  // Update status to in_progress, attempt_count, and last_call_date
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetsId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `${env.googleSheetName}!F${rowIndex}`,
          values: [['in_progress']],
        },
        {
          range: `${env.googleSheetName}!G${rowIndex}`,
          values: [[attemptCount]],
        },
        {
          range: `${env.googleSheetName}!H${rowIndex}`,
          values: [[now]],
        },
      ],
    },
  });
}

/** Update a contact row with call results from the HappyRobot callback */
export async function updateCallResult(
  phoneNumber: string,
  callResult: string,
  documentationConfirmed: boolean,
  callSummary: string,
): Promise<void> {
  const all = await getAllContacts();
  const match = all.find((row) => row.data.phone_number === phoneNumber);
  if (!match) {
    console.warn(`No contact found with phone number: ${phoneNumber}`);
    return;
  }

  const sheets = getClient();
  const newStatus = documentationConfirmed
    ? 'completed'
    : match.data.attempt_count >= env.maxRetries
      ? 'max_retries_reached'
      : 'in_progress';

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: env.googleSheetsId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        {
          range: `${env.googleSheetName}!F${match.rowIndex}`,
          values: [[newStatus]],
        },
        {
          range: `${env.googleSheetName}!I${match.rowIndex}`,
          values: [[callResult]],
        },
        {
          range: `${env.googleSheetName}!J${match.rowIndex}`,
          values: [[documentationConfirmed ? 'TRUE' : 'FALSE']],
        },
        {
          range: `${env.googleSheetName}!K${match.rowIndex}`,
          values: [[callSummary]],
        },
      ],
    },
  });

  console.log(
    `Updated contact ${phoneNumber}: status=${newStatus}, result=${callResult}, docs_confirmed=${documentationConfirmed}`,
  );
}

function parseRow(row: string[]): MerchantContact {
  return {
    merchant_name: row[SHEET_COLUMNS.merchant_name] ?? '',
    contact_name: row[SHEET_COLUMNS.contact_name] ?? '',
    phone_number: row[SHEET_COLUMNS.phone_number] ?? '',
    razon_social: row[SHEET_COLUMNS.razon_social] ?? '',
    pending_documents: row[SHEET_COLUMNS.pending_documents] ?? '',
    status: (row[SHEET_COLUMNS.status] as MerchantContact['status']) ?? 'pending',
    attempt_count: Number(row[SHEET_COLUMNS.attempt_count] ?? 0),
    last_call_date: row[SHEET_COLUMNS.last_call_date] ?? '',
    last_call_result: (row[SHEET_COLUMNS.last_call_result] as MerchantContact['last_call_result']) ?? '',
    documentation_confirmed: row[SHEET_COLUMNS.documentation_confirmed] === 'TRUE',
    call_summary: row[SHEET_COLUMNS.call_summary] ?? '',
    created_at: row[SHEET_COLUMNS.created_at] ?? '',
    notes: row[SHEET_COLUMNS.notes] ?? '',
  };
}
