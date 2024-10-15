import { NextResponse } from 'next/server';
import { google } from 'googleapis';



export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId') || 'root';
    const accessToken = req.cookies.get('googleDriveAccessToken')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Không có quyền truy cập Google Drive' }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
    });

    return NextResponse.json({ folders: res.data.files });
  } catch (error) {
    console.error('Lỗi khi lấy cấu trúc thư mục:', error);
    return NextResponse.json({ error: 'Không thể lấy cấu trúc thư mục' }, { status: 500 });
  }
}