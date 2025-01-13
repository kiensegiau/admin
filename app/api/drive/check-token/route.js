import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    // Lấy session cookie
    const sessionCookie = cookies().get("session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ isAuthenticated: false });
    }

    // Verify session cookie
    const decodedClaims = await auth.verifySessionCookie(sessionCookie, true);

    // Kiểm tra email admin
    if (decodedClaims.email !== "phanhuukien2001@gmail.com") {
      return NextResponse.json(
        { error: "Không có quyền truy cập" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      isAuthenticated: true,
      user: decodedClaims,
    });
  } catch (error) {
    console.error("Check token error:", error);
    return NextResponse.json(
      { isAuthenticated: false, error: error.message },
      { status: 401 }
    );
  }
}
