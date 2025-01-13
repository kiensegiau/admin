import { readTokens, writeTokens } from "./tokenStorage";
import { google } from "googleapis";

let isRefreshing = false;
const REFRESH_INTERVAL = 25 * 60 * 1000; // 25 phút

async function refreshToken() {
  if (isRefreshing) {
    return;
  }

  try {
    isRefreshing = true;
    console.log("Bắt đầu kiểm tra và làm mới token...");

    const tokens = readTokens();
    if (!tokens?.refresh_token) {
      console.log("Không có refresh token để làm mới");
      return;
    }

    // Kiểm tra xem token có cần làm mới không
    const expiryDate = tokens.expiry_date;
    const now = Date.now();
    const timeUntilExpiry = expiryDate - now;

    // Nếu token còn hạn trên 30 phút thì không cần làm mới
    if (timeUntilExpiry > 30 * 60 * 1000) {
      console.log("Token vẫn còn hạn, không cần làm mới");
      console.log(
        "Thời gian còn lại:",
        Math.floor(timeUntilExpiry / 60 / 1000),
        "phút"
      );
      return;
    }

    // Kiểm tra các biến môi trường cần thiết
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error("Thiếu thông tin client ID hoặc client secret");
      return;
    }

    console.log("Đang khởi tạo OAuth2 client với:", {
      clientId: process.env.GOOGLE_CLIENT_ID?.substring(0, 10) + "...",
      clientSecret: "***",
      callbackUrl: process.env.CALLBACK_URL,
    });

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.CALLBACK_URL
    );

    // Set đầy đủ credentials
    oauth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type,
      id_token: tokens.id_token,
    });

    // Refresh token trực tiếp
    console.log("Đang gửi yêu cầu làm mới token...");
    const { credentials } = await oauth2Client.refreshAccessToken();

    console.log("Đã nhận được token mới:", {
      access_token: credentials.access_token?.substring(0, 20) + "...",
      expiry_date: new Date(credentials.expiry_date).toLocaleString(),
      scope: credentials.scope,
    });

    // Lưu token mới, giữ lại các thông tin khác từ token cũ
    const newTokens = {
      ...tokens,
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
      scope: credentials.scope || tokens.scope,
      token_type: credentials.token_type || tokens.token_type,
      id_token: credentials.id_token || tokens.id_token,
    };

    writeTokens(newTokens);
    console.log("Đã lưu token mới thành công");
  } catch (error) {
    console.error("Lỗi khi làm mới token:", error.message);
    if (error.response?.data) {
      console.error("Chi tiết lỗi:", error.response.data);
    }
  } finally {
    isRefreshing = false;
  }
}

let refreshInterval = null;

// Khởi động service làm mới token
export function startTokenRefresher() {
  if (refreshInterval) {
    console.log("Service làm mới token đã được khởi động trước đó");
    return;
  }

  console.log("Khởi động service làm mới token...");

  // Làm mới ngay khi khởi động
  refreshToken();

  // Thiết lập interval để làm mới định kỳ
  refreshInterval = setInterval(refreshToken, REFRESH_INTERVAL);

  // Thêm xử lý khi process kết thúc
  process.on("SIGTERM", () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      console.log("Đã dừng service làm mới token");
    }
  });
}
