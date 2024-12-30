import jwt from "jsonwebtoken";

// Các hàm xử lý cookie
export function setCookie(name, value, options = {}) {
  if (typeof document === "undefined") return;
  let cookieString = `${name}=${value}`;
  if (options.maxAge) cookieString += `; Max-Age=${options.maxAge}`;
  if (options.path) cookieString += `; Path=${options.path}`;
  document.cookie = cookieString;
}

export function getCookie(name) {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

// Kiểm tra trạng thái xác thực
export async function checkAuthStatus() {
  try {
    const response = await fetch("/api/auth/check-auth");
    const data = await response.json();
    return {
      isAuthenticated: data.isAuthenticated,
      user: data.user,
      accessToken: data.accessToken,
    };
  } catch (error) {
    console.error("Lỗi kiểm tra xác thực:", error);
    return {
      isAuthenticated: false,
      error: error.message,
    };
  }
}

// Lấy URL đăng nhập Google
export async function getGoogleAuthUrl() {
  try {
    const response = await fetch("/api/auth/google-auth-url");
    const data = await response.json();
    return data.url;
  } catch (error) {
    console.error("Lỗi lấy URL đăng nhập:", error);
    return null;
  }
}

// Các hàm xử lý token video
export function generateVideoToken(videoId) {
  return jwt.sign({ videoId }, process.env.NEXT_PUBLIC_ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });
}

export function verifyVideoToken(token, videoId) {
  try {
    const decoded = jwt.verify(
      token,
      process.env.NEXT_PUBLIC_ACCESS_TOKEN_SECRET
    );
    return decoded.videoId === videoId;
  } catch {
    return false;
  }
}
