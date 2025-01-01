import fs from "fs";
import path from "path";
import { refreshAccessToken } from "./refreshToken";

const TOKEN_PATH = path.join(process.cwd(), "tokens.json");

// Đọc token từ file
export function readTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  } catch (error) {
    console.error("Error reading tokens:", error);
    return null;
  }
}

// Lưu token vào file
export function writeTokens(tokens) {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  } catch (error) {
    console.error("Error writing tokens:", error);
  }
}

export async function getValidTokens() {
  const tokens = readTokens();
  if (!tokens) return null;

  // Kiểm tra token hết hạn chưa
  const expiryDate = new Date(tokens.expiry_date);
  const now = new Date();

  // Nếu token còn hạn hoặc còn 5 phút
  if (expiryDate > now && (expiryDate - now) > 5 * 60 * 1000) {
    return tokens;
  }

  try {
    // Refresh token
    console.log("Refreshing access token...");
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    
    // Lưu tokens mới
    writeTokens({
      ...tokens,
      access_token: newTokens.access_token,
      expiry_date: newTokens.expiry_date
    });

    return newTokens;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}
