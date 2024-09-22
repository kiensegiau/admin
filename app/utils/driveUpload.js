import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/api/auth/google-callback";

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

export const getAuthUrl = () => {
  const scopes = ['https://www.googleapis.com/auth/drive.file'];
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
};

export const setCredentials = async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  return tokens;
};

export const uploadToDrive = async (file, accessToken, progressCallback, path) => {
  const folders = path.split('/').filter(Boolean);
  let parentId = 'root';

  for (const folderName of folders) {
    parentId = await createOrGetFolder(folderName, parentId, accessToken);
  }

  const metadata = {
    name: file.name,
    mimeType: file.type,
    parents: [parentId]
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100;
        progressCallback(progress);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        if (response.id && response.webViewLink) {
          resolve({
            id: response.id,
            webViewLink: response.webViewLink
          });
        } else {
          reject(new Error('Không nhận được link xem file từ Google Drive'));
        }
      } else {
        reject(new Error(`Lỗi khi tải lên Google Drive: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Lỗi mạng khi tải lên Google Drive'));

    xhr.send(form);
  });
};

async function createOrGetFolder(folderName, parentId, accessToken) {
  const query = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  const data = await response.json();

  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  } else {
    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId]
    };
    const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    const folder = await createResponse.json();
    return folder.id;
  }
}