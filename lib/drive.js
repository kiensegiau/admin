const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

async function getDriveService(accessToken) {
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function getFileMetadata(fileId, accessToken) {
  const drive = await getDriveService(accessToken);
  const response = await drive.files.get({
    fileId: fileId,
    fields: 'id, name, mimeType, webViewLink',
  });
  return response.data;
}

async function downloadFile(fileId, accessToken) {
  const drive = await getDriveService(accessToken);
  const response = await drive.files.get({
    fileId: fileId,
    alt: 'media',
  }, { responseType: 'stream' });
  return response.data;
}

module.exports = {
  getFileMetadata,
  downloadFile,
};