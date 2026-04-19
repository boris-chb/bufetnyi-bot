import { google } from "googleapis";
import { GoogleAuth } from "google-auth-library";

type User = {
  id: string;
  name: string;
  username: string;
  first_seen: string;
  last_seen: string;
};

const GOOGLE_SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function getGoogleSheetsClient() {
  const auth = new GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [GOOGLE_SHEETS_SCOPE],
  });

  return google.sheets({ version: "v4", auth });
}

function formatTimestampForSheets(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function syncUsersToSheet(users: User[]): Promise<void> {
  const sheets = getGoogleSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME;

  if (!spreadsheetId || !sheetName) {
    throw new Error("GOOGLE_SHEET_ID and GOOGLE_SHEET_NAME must be set");
  }

  const values = users.map((u) => [
    u.id,
    String(u.name ?? "").trim(),
    u.username,
    formatTimestampForSheets(+u.first_seen),
    formatTimestampForSheets(+u.last_seen),
  ]);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1:E${users.length + 1}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["id", "name", "username", "first_seen", "last_seen"],
        ...values,
      ],
    },
  });
}

