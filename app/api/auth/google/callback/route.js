export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { google } from "googleapis";
import { saveTokens } from "@/lib/tokenStorage";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.redirect("/login?error=NoCode");
    }

    // Đổi code lấy token
    const { tokens } = await oauth2Client.getToken(code);

    // Lưu token vào file
    saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
    });

    // Tạo response với redirect
    const response = NextResponse.redirect(new URL("/dashboard", request.url));

    // Vẫn lưu vào cookie để dùng ở client
    response.cookies.set("access_token", tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600,
    });

    return response;
  } catch (error) {
    console.error("Lỗi xử lý callback:", error);
    return NextResponse.redirect("/login?error=AuthFailed");
  }
}
