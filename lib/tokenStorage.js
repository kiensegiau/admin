import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), "tokens.json");

// Đọc token từ file
export function readTokens() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      const data = fs.readFileSync(TOKEN_PATH, "utf8");
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error("Lỗi khi đọc tokens:", error);
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

// Chỉ đọc token, không tự động làm mới
export async function getValidTokens() {
  try {
    const tokens = readTokens();
    if (!tokens) {
      console.error("Không tìm thấy tokens");
      return null;
    }
    return tokens;
  } catch (error) {
    console.error("Lỗi khi đọc token:", error);
    return null;
  }
}

export function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    return true;
  } catch (error) {
    console.error("Lỗi khi lưu tokens:", error);
    return false;
  }
}
