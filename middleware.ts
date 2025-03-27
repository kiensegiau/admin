import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

// Các route không cần xác thực
const PUBLIC_ROUTES = [
  "/login",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/auth/check-token",
];

// Rate limiting
const RATE_LIMIT = 100; // Số request tối đa cho API thường
const PROXY_RATE_LIMIT = 30; // Số request tối đa cho API proxy
const LOGIN_RATE_LIMIT = 5; // Số lần thử đăng nhập tối đa
const RATE_INTERVAL = 60 * 1000; // Thời gian reset (1 phút)
const ipRequestCount = new Map<string, { count: number; timestamp: number }>();
const proxyIpRequestCount = new Map<
  string,
  { count: number; timestamp: number }
>();
const loginIpRequestCount = new Map<
  string,
  { count: number; timestamp: number }
>();

function isRateLimited(
  ip: string,
  type: "normal" | "proxy" | "login"
): boolean {
  const now = Date.now();
  let requestMap: Map<string, { count: number; timestamp: number }>;
  let limit: number;

  switch (type) {
    case "proxy":
      requestMap = proxyIpRequestCount;
      limit = PROXY_RATE_LIMIT;
      break;
    case "login":
      requestMap = loginIpRequestCount;
      limit = LOGIN_RATE_LIMIT;
      break;
    default:
      requestMap = ipRequestCount;
      limit = RATE_LIMIT;
  }

  const requestData = requestMap.get(ip);

  if (!requestData) {
    requestMap.set(ip, { count: 1, timestamp: now });
    return false;
  }

  if (now - requestData.timestamp > RATE_INTERVAL) {
    requestMap.set(ip, { count: 1, timestamp: now });
    return false;
  }

  // Thêm log để debug
  console.log(`Rate limit check - IP: ${ip}, Type: ${type}, Count: ${requestData.count}/${limit}`);

  if (requestData.count >= limit) {
    console.log(`⚠️ Rate limit exceeded - IP: ${ip}, Type: ${type}`);
    return true;
  }

  requestData.count++;
  requestMap.set(ip, requestData);
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ip = request.ip ?? request.headers.get("x-forwarded-for") ?? "unknown";

  console.log(`📝 Request - Path: ${pathname}, IP: ${ip}`);

  // Rate limiting cho login
  if (pathname === "/login" || pathname === "/api/auth/signin") {
    // Reset login count sau mỗi lần đăng nhập thành công
    if (pathname === "/api/auth/signin" && request.method === "POST") {
      // Chỉ áp dụng rate limiting cho các request không thành công
      // Kiểm tra nếu là POST thì không tăng count ngay lập tức
      const loginData = loginIpRequestCount.get(ip);
      if (loginData && loginData.count > 0) {
        console.log(`👤 Login attempt - IP: ${ip}, Count: ${loginData.count}`);
      }
    }
    
    if (isRateLimited(ip, "login")) {
      console.log(`🚫 Login blocked due to rate limit - IP: ${ip}`);
      if (pathname.startsWith("/api")) {
        return NextResponse.json(
          { error: "Quá nhiều lần thử đăng nhập, vui lòng thử lại sau 1 phút" },
          { status: 429 }
        );
      }
      // Chuyển hướng đến trang thông báo lỗi cho route /login
      return NextResponse.json(
        { error: "Quá nhiều lần thử đăng nhập, vui lòng thử lại sau 1 phút" },
        { status: 429 }
      );
    }
  }

  // Rate limiting cho API proxy
  if (pathname.startsWith("/api/proxy")) {
    if (isRateLimited(ip, "proxy")) {
      return NextResponse.json(
        {
          error:
            "Quá nhiều yêu cầu, vui lòng thử lại sau (giới hạn 30 request/phút)",
        },
        { status: 429 }
      );
    }
    return NextResponse.next();
  }

  // Rate limiting cho các API khác
  if (pathname.startsWith("/api")) {
    if (isRateLimited(ip, "normal")) {
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

      // Thêm log để debug
      console.log(`✅ Auth check - Email: ${data.email}, ADMIN_EMAIL: ${ADMIN_EMAIL}`);
      
      // So sánh chính xác hơn với trim và toLowerCase
      const userEmail = data.email?.trim().toLowerCase();
      const adminEmail = ADMIN_EMAIL?.trim().toLowerCase();
      
      console.log(`📊 Email comparison: '${userEmail}' === '${adminEmail}', Result: ${userEmail === adminEmail}`);

      if (!data.email || userEmail !== adminEmail) {
        console.log(`⛔ Access denied - Email: ${data.email}`);
        if (pathname.startsWith("/api")) {
          return NextResponse.json(
            { error: `Không có quyền truy cập. Email '${data.email}' không phải là admin.` },
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
