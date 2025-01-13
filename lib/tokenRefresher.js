import { readTokens, writeTokens } from "./tokenStorage";
import { google } from "googleapis";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

export async function refreshDriveToken() {
  try {
    const tokens = await readTokens();
    if (!tokens?.refresh_token) {
      console.log("Không có refresh token của Drive");
      return null;
    }

    // Set credentials cho oauth2Client
    oauth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type,
    });

    // Làm mới access token
    const { credentials } = await oauth2Client.refreshAccessToken();

    // Lưu lại token mới nhưng giữ nguyên refresh_token
    const newTokens = {
      ...tokens,
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
      scope: credentials.scope || tokens.scope,
      token_type: credentials.token_type || tokens.token_type,
    };

    await writeTokens(newTokens);
    return newTokens;
  } catch (error) {
    console.error("Lỗi khi làm mới token Drive:", error);
    return null;
  }
}

export async function checkAndRefreshToken() {
  try {
    const tokens = await readTokens();
    if (!tokens?.access_token) {
      return null;
    }

    const expiryDate = new Date(tokens.expiry_date).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiryDate - now;

    // Nếu token sắp hết hạn (còn dưới 5 phút) thì làm mới
    if (timeUntilExpiry < 5 * 60 * 1000) {
      return await refreshDriveToken();
    }

    return tokens;
  } catch (error) {
    console.error("Lỗi khi kiểm tra token Drive:", error);
    return null;
  }
}
