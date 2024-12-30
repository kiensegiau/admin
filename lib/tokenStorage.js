import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), "tokens.json");

// Đọc token từ file
export function readTokens() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
      return tokens;
    }
    return null;
  } catch (error) {
    console.error("Lỗi đọc token:", error);
    return null;
  }
}

// Lưu token vào file
export function saveTokens(tokens) {
  try {
    // Đọc token cũ nếu có
    let existingTokens = {};
    if (fs.existsSync(TOKEN_PATH)) {
      existingTokens = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
    }

    // Merge token mới với token cũ, giữ lại refresh_token cũ nếu không có refresh_token mới
    const newTokens = {
      ...existingTokens,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
      refresh_token: tokens.refresh_token || existingTokens.refresh_token,
    };

    fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens, null, 2));
    return true;
  } catch (error) {
    console.error("Lỗi lưu token:", error);
    return false;
  }
}
