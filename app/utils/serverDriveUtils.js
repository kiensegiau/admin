import { google } from "googleapis";

// Khởi tạo Google Drive API client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

export async function initializeDriveClient(accessToken) {
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export async function getFolderInfo(drive, folderId) {
  return await drive.files.get({
    fileId: folderId,
    fields: 'name',
  });
}

export async function listFolderContents(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size)',
    orderBy: 'name',
  });
  return res.data.files;
} 