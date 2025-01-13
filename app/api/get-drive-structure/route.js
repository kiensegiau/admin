export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { readTokens } from "@/lib/tokenStorage";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get("folderId") || "root";

    // Đọc token từ file
    const tokens = readTokens();
    if (!tokens?.access_token) {
      return NextResponse.json(
        { error: "Không có quyền truy cập Google Drive" },
        { status: 401 }
      );
    }

    // Khởi tạo Drive client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.CALLBACK_URL
    );
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Chỉ lấy danh sách folders
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      orderBy: "name",
    });

    return NextResponse.json({
      folders: response.data.files || [],
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách thư mục:", error);
    return NextResponse.json(
      { error: "Không thể lấy danh sách thư mục" },
      { status: 500 }
    );
  }
}
