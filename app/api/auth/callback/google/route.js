export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.redirect("/login?error=NoCode");
    }

    const { tokens } = await oauth2Client.getToken(code);

    // Lưu token vào cookie hoặc session
    const response = NextResponse.redirect("/import-from-drive");
    response.cookies.set("token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600, // 1 giờ
    });

    return response;
  } catch (error) {
    console.error("Lỗi xử lý callback:", error);
    return NextResponse.redirect("/login?error=AuthFailed");
  }
}
