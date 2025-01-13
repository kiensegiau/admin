import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), "tokens.json");

export async function readTokens() {
  try {
    // Kiểm tra file có tồn tại không
    if (!fs.existsSync(TOKEN_PATH)) {
      console.log("Không tìm thấy tokens");
      return null;
    }

    const data = fs.readFileSync(TOKEN_PATH, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc tokens:", error);
    return null;
  }
}

export async function writeTokens(tokens) {
  try {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log("Đã lưu tokens thành công");
    return true;
  } catch (error) {
    console.error("Lỗi khi lưu tokens:", error);
    return false;
  }
}

export async function clearTokens() {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
    return true;
  } catch (error) {
    console.error("Lỗi khi xóa tokens:", error);
    return false;
  }
}

export async function saveTokens(tokens) {
  return writeTokens(tokens);
}

export async function getValidTokens() {
  return readTokens();
}
