import { google } from "googleapis";
import { writeTokens } from "./tokenStorage";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export async function refreshAccessToken(refreshToken) {
  try {
    console.log("Bắt đầu refresh access token");

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    console.log("Đã refresh token thành công");

    // Lưu token mới
    await writeTokens({
      access_token: credentials.access_token,
      refresh_token: refreshToken, // Giữ nguyên refresh token cũ
      expiry_date: credentials.expiry_date,
    });

    return credentials.access_token;
  } catch (error) {
    console.error("Lỗi khi refresh token:", error);
    throw new Error("Không thể refresh access token: " + error.message);
  }
}
