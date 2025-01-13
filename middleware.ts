import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_EMAIL = "phanhuukien2001@gmail.com";

const PUBLIC_ROUTES = [
  "/api/proxy",
  "/api/auth/google",
  "/api/auth/google-callback",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/auth/check-token",
  "/api/auth/refresh-token",
  "/api/auth/google-auth-url",
  "/api/auth/login",
  "/api/auth/verify",
];

export async function middleware(request: NextRequest) {
  // Chỉ check các route API
  if (!request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Cho phép các route public
  if (
    PUBLIC_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route))
  ) {
    return NextResponse.next();
  }

  try {
    // Gọi API check-token để verify session
    const session = request.cookies.get("session")?.value;
    if (!session) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const response = await fetch(
      `${request.nextUrl.origin}/api/auth/check-token`,
      {
        headers: {
          Cookie: `session=${session}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.message || "Phiên đăng nhập không hợp lệ" },
        { status: response.status }
      );
    }

    const data = await response.json();
    if (data.email !== ADMIN_EMAIL) {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 }
      );
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json({ error: "Lỗi xác thực" }, { status: 500 });
  }
}

export const config = {
  matcher: "/api/:path*",
};
