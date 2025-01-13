export const dynamic = "force-dynamic";

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

    // Lưu token mới, giữ lại các thông tin khác từ token cũ
    const newTokens = {
      ...tokens, // Giữ lại tất cả thông tin cũ
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
      scope: credentials.scope || tokens.scope, // Giữ scope cũ nếu không có scope mới
      token_type: credentials.token_type || tokens.token_type, // Giữ token_type cũ nếu không có mới
      id_token: credentials.id_token || tokens.id_token, // Giữ id_token cũ nếu không có mới
    };

    writeTokens(newTokens);
    console.log("Đã làm mới và lưu token thành công");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lỗi làm mới token Drive:", error);
    return NextResponse.json(
      { error: "Không thể làm mới token" },
      { status: 500 }
    );
  }
}
