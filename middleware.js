import { NextResponse } from "next/server";

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

  return NextResponse.next();
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
    '/((?!api/public|api/auth|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
