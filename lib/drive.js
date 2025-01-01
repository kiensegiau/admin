import { google } from "googleapis";

export async function getFileMetadata(fileId, tokens) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const response = await drive.files.get({
    fileId: fileId,
    fields: "id, name, mimeType, size",
  });

  return response.data;
}

export async function downloadFile(fileId, options = {}, tokens) {
  if (!tokens?.access_token) {
    throw new Error("Không có access token");
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials(tokens);

  const drive = google.drive({
    version: "v3", 
    auth: oauth2Client,
  });

  console.log("Download options:", options);

  const response = await drive.files.get(
    {
      fileId: fileId,
      alt: "media",
      ...options,
    },
    {
      responseType: "stream",
    }
  );

  let bytesDownloaded = 0;
  response.data.on('data', chunk => {
    bytesDownloaded += chunk.length;
    console.log(`Đã tải: ${bytesDownloaded} bytes`);
  });

  response.data.on('end', () => {
    console.log(`Hoàn thành tải: ${bytesDownloaded} bytes`);
  });

  response.data.on('error', err => {
    console.error('Lỗi khi tải:', err);
  });

  return response.data;
}
