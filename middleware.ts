import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: [
    // Bỏ qua các static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

const ADMIN_EMAIL = "phanhuukien2001@gmail.com";

// Các route được phép truy cập công khai
const PUBLIC_ROUTES = [
  "/login", // Trang đăng nhập
  "/_next", // Next.js resources
  "/favicon.ico",
  "/api/proxy", // API proxy cho khách hàng
  "/api/auth", // Các API xác thực
  "/api/drive", // API liên quan đến Drive
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cho phép truy cập các route công khai
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Lấy token từ header hoặc cookie
  const authHeader = request.headers.get("authorization");
  const sessionCookie = request.cookies.get("session");

  // Nếu không có token và không có session cookie
  if (!authHeader && !sessionCookie) {
    if (pathname.startsWith("/api")) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized - No token provided" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    let tokenInfo;
    if (authHeader?.startsWith("Bearer ")) {
      // Verify ID token
      const idToken = authHeader.split(" ")[1];
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idToken }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.users?.[0]) {
        throw new Error("Invalid token");
      }
      tokenInfo = data.users[0];
    } else if (sessionCookie) {
      // Verify session cookie
      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ idToken: sessionCookie.value }),
        }
      );
      const data = await response.json();
      if (!response.ok || !data.users?.[0]) {
        throw new Error("Invalid session");
      }
      tokenInfo = data.users[0];
    }

    // Kiểm tra email admin
    if (tokenInfo?.email !== ADMIN_EMAIL) {
      if (pathname.startsWith("/api")) {
        return new NextResponse(
          JSON.stringify({ error: "Forbidden - Admin access required" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return NextResponse.redirect(new URL("/login", request.url));
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Auth error:", error);
    if (pathname.startsWith("/api")) {
      return new NextResponse(
        JSON.stringify({ error: "Unauthorized - Invalid token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
