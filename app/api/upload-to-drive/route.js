import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

export async function POST(req) {
  try {
    const { file } = await req.json();
    const accessToken = req.headers.get('Authorization').split(' ')[1];

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const response = await drive.files.create({
      requestBody: {
        name: file.name,
        mimeType: file.type,
      },
      media: {
        mimeType: file.type,
        body: Readable.from(Buffer.from(file.content, 'base64')),
      },
      fields: 'id, webViewLink',
    });

    return NextResponse.json({ 
      fileId: response.data.id,
      webViewLink: response.data.webViewLink
    });
  } catch (error) {
    console.error('Lỗi khi tải lên Google Drive:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}