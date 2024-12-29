import { google } from 'googleapis';
import { getAccessToken } from './auth';

export async function getFileMetadata(fileId) {
  // 1. Lấy access token
  const accessToken = await getAccessToken();
  
  // 2. Tạo OAuth2 client
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  // 3. Khởi tạo Drive API với auth
  const drive = google.drive({ 
    version: 'v3', 
    auth: oauth2Client  // Dùng oauth2Client thay vì accessToken
  });
  
  // 4. Gọi API
  const response = await drive.files.get({
    fileId: fileId,
    fields: 'id, name, mimeType, size'
  });
  
  return response.data;
}

export async function downloadFile(fileId, options = {}) {
  const accessToken = await getAccessToken();
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  const drive = google.drive({ 
    version: 'v3', 
    auth: oauth2Client 
  });

  console.log('Download options:', options);

  const response = await drive.files.get({
    fileId: fileId,
    alt: 'media',
    ...options
  }, {
    responseType: 'stream'
  });

  return response.data;
}