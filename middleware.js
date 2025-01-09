import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";

export async function middleware(request) {
  const session = request.cookies.get("session")?.value || "";

  // Trả về ngay nếu đang ở trang login
  if (request.nextUrl.pathname === "/login") {
    if (session) {
      try {
        await auth.verifySessionCookie(session, true);
        return NextResponse.redirect(new URL("/", request.url));
      } catch (error) {
        return NextResponse.next();
      }
    }
    return NextResponse.next();
  }

  // Kiểm tra session cho các trang khác
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await auth.verifySessionCookie(session, true);
    return NextResponse.next();
  } catch (error) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/users/:path*",
    "/courses/:path*",
    "/settings/:path*",
  ],
};
