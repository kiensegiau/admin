export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { readTokens } from "@/lib/tokenStorage";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

export async function GET() {
  try {
    // Đọc token từ file
    const tokens = readTokens();

    if (!tokens?.access_token) {
      return NextResponse.json({ isAuthenticated: false });
    }

    // Cấu hình oauth2Client với token
    oauth2Client.setCredentials(tokens);

    // Lấy thông tin user
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    return NextResponse.json({
      isAuthenticated: true,
      user: userInfo.data,
      accessToken: tokens.access_token,
    });
  } catch (error) {
    console.error("Lỗi kiểm tra xác thực:", error);
    return NextResponse.json(
      { isAuthenticated: false, error: error.message },
      { status: 500 }
    );
  }
}
