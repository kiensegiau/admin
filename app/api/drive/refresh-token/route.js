import { NextResponse } from "next/server";
import { readTokens, writeTokens } from "@/lib/tokenStorage";
import { google } from "googleapis";

export async function POST() {
  try {
    const tokens = readTokens();
    if (!tokens?.refresh_token) {
      return NextResponse.json(
        { error: "Không tìm thấy refresh token" },
        { status: 401 }
      );
    }

    // Khởi tạo OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    // Set refresh token
    oauth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
    });

    // Refresh token
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Lưu token mới
    const newTokens = {
      access_token: credentials.access_token,
      refresh_token: tokens.refresh_token, // Giữ nguyên refresh token cũ
      expiry_date: credentials.expiry_date,
    };

    writeTokens(newTokens);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lỗi làm mới token Drive:", error);
    return NextResponse.json(
      { error: "Không thể làm mới token" },
      { status: 500 }
    );
  }
}
