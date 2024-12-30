import { google } from "googleapis";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { folderId, accessToken } = await req.json();

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: "name",
    });

    return NextResponse.json({ success: true, data: folderInfo.data });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
