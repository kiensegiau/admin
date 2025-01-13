import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_EMAIL = "phanhuukien2001@gmail.com";

// Các route không cần xác thực
const PUBLIC_ROUTES = [
  "/login",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/auth/check-token",
  "/api/proxy",
];

// Rate limiting
const RATE_LIMIT = 100; // Số request tối đa
const RATE_INTERVAL = 60 * 1000; // Thời gian reset (1 phút)
const ipRequestCount = new Map<string, { count: number; timestamp: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const requestData = ipRequestCount.get(ip);

  if (!requestData) {
    ipRequestCount.set(ip, { count: 1, timestamp: now });
    return false;
  }

  if (now - requestData.timestamp > RATE_INTERVAL) {
    ipRequestCount.set(ip, { count: 1, timestamp: now });
    return false;
  }

  if (requestData.count >= RATE_LIMIT) {
    return true;
  }

  requestData.count++;
  ipRequestCount.set(ip, requestData);
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rate limiting cho API routes
  if (pathname.startsWith("/api")) {
    const ip =
      request.ip ?? request.headers.get("x-forwarded-for") ?? "unknown";
    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Quá nhiều yêu cầu, vui lòng thử lại sau" },
        { status: 429 }
      );
    }
  }

  // Cho phép truy cập các route công khai
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Kiểm tra session cookie
  const session = request.cookies.get("session");

  // Nếu không có session, chuyển hướng về trang login
  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Kiểm tra quyền admin cho các route không phải /api/proxy và /api/auth
  if (!pathname.startsWith("/api/proxy") && !pathname.startsWith("/api/auth")) {
    try {
      const response = await fetch(
        new URL("/api/auth/check-token", request.url),
        {
          headers: {
            Cookie: `session=${session.value}`,
          },
        }
      );
      const data = await response.json();

      console.log("Check-token response:", {
        receivedEmail: data.email,
        adminEmail: ADMIN_EMAIL,
        isMatch: data.email === ADMIN_EMAIL,
      });

      if (!data.email || data.email !== ADMIN_EMAIL) {
        if (pathname.startsWith("/api")) {
          return NextResponse.json(
            { error: "Không có quyền truy cập" },
            { status: 403 }
          );
        }
        const loginUrl = new URL("/login", request.url);
        return NextResponse.redirect(loginUrl);
      }
    } catch (error) {
      console.error("Lỗi kiểm tra token:", error);
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Lỗi xác thực" }, { status: 500 });
      }
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Áp dụng middleware cho tất cả các route trừ static files
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
