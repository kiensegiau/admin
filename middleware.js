import { NextResponse } from "next/server";
import { jwtDecode } from "jwt-decode";

export async function middleware(request) {
  const session = request.cookies.get("session")?.value || "";

  // Trả về ngay nếu đang ở trang login
  if (request.nextUrl.pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // Kiểm tra session cho các trang khác
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    // Giải mã session token để lấy thông tin user
    const decodedToken = jwtDecode(session);

    // Kiểm tra email
    if (decodedToken.email !== "phanhuukien2001@gmail.com") {
      // Xóa cookie nếu không phải admin
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("session");
      return response;
    }

    return NextResponse.next();
  } catch (error) {
    // Session không hợp lệ hoặc hết hạn
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("session");
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/public (API routes that don't require authentication)
     * - api/auth (authentication endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public (public files)
     */
    "/((?!api/public|api/auth|_next/static|_next/image|favicon.ico|public).*)",
  ],
};
