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
  try {
    const tokens = readTokens();
    if (!tokens) {
      console.error("Không tìm thấy tokens");
      return null;
    }

    // Kiểm tra token hết hạn chưa
    const expiryDate = new Date(tokens.expiry_date);
    const now = new Date();

    // Nếu token còn hạn hoặc còn 5 phút
    if (expiryDate > now && expiryDate - now > 5 * 60 * 1000) {
      return tokens;
    }

    // Refresh token nếu hết hạn
    console.log("Token hết hạn, đang refresh...");
    const newAccessToken = await refreshAccessToken(tokens.refresh_token);

    return {
      ...tokens,
      access_token: newAccessToken,
    };
  } catch (error) {
    console.error("Lỗi khi lấy/refresh token:", error);
    return null;
  }
}
