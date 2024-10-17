import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import { google } from 'googleapis';
import { Readable } from 'stream';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/api/auth/google-callback";

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

export const getAuthUrl = () => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });
};

export const setCredentials = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  // Lưu refresh token vào cookie hoặc local storage
  document.cookie = `googleDriveRefreshToken=${tokens.refresh_token}; max-age=31536000; path=/`;
  return tokens;
};

export async function uploadToDrive(file, accessToken, onProgress, drivePath) {
  try {
    const folderIds = await createFolderStructure(drivePath, accessToken);
    const parentFolderId = folderIds[folderIds.length - 1];

    const metadata = {
      name: file.name,
      parents: [parentFolderId],
      mimeType: file.type
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await axios.post(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      form,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${form._boundary}`,
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        },
      }
    );

    return {
      fileId: response.data.id,
      webViewLink: response.data.webViewLink
    };
  } catch (error) {
    console.error('Lỗi chi tiết:', error.response?.data);
    throw new Error(`Lỗi khi tải lên Google Drive: ${error.response?.data?.error?.message || error.message}`);
  }
}

async function createFolderStructure(drivePath, accessToken) {
  const folderNames = drivePath.split('/').filter(Boolean);
  let parentId = 'root';
  const folderIds = [];

  for (const folderName of folderNames) {
    const folderId = await createOrGetFolder(folderName, parentId, accessToken);
    folderIds.push(folderId);
    parentId = folderId;
  }

  return folderIds;
}

async function createOrGetFolder(folderName, parentId, accessToken) {
  const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  
  try {
    const response = await axios.get(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id;
    } else {
      const createResponse = await axios.post('https://www.googleapis.com/drive/v3/files', {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      }, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      return createResponse.data.id;
    }
  } catch (error) {
    console.error('Lỗi khi tạo hoặc lấy thư mục:', error);
    throw error;
  }
}
