import fs from "fs";
import path from "path";

const TOKEN_PATH = path.join(process.cwd(), "tokens.json");

export async function readTokens() {
  try {
    // Thêm log để debug
    console.log("Reading tokens from:", process.cwd());
    
    const tokenPath = path.join(process.cwd(), 'tokens.json');
    console.log("Token file path:", tokenPath);
    
    if (!fs.existsSync(tokenPath)) {
      console.log("Token file not found");
      return null;
    }

    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    console.log("Raw tokens read:", tokens); // Thêm log này để xem nội dung thực tế

    return tokens;
  } catch (error) {
    console.error("Error reading tokens:", error);
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
