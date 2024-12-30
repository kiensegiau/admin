import { NextResponse } from "next/server";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

export async function GET() {
  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/drive.file",
      ],
      include_granted_scopes: true,
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Lỗi tạo URL xác thực:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
