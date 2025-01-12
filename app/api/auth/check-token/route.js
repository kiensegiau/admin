import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

const TOKEN_EXPIRY_THRESHOLD = 5 * 60 * 1000; // 5 phút

export async function GET() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get("session")?.value;

    if (!session) {
      return NextResponse.json({ error: "No session found" }, { status: 401 });
    }

    // Verify và decode session cookie
    const decodedClaims = await auth.verifySessionCookie(session);

    // Kiểm tra thời gian hết hạn
    const expirationTime = decodedClaims.exp * 1000; // Convert to milliseconds
    const now = Date.now();
    const timeUntilExpiry = expirationTime - now;

    // Trả về shouldRefresh nếu token sắp hết hạn
    return NextResponse.json({
      shouldRefresh: timeUntilExpiry < TOKEN_EXPIRY_THRESHOLD,
      expiresIn: timeUntilExpiry,
    });
  } catch (error) {
    console.error("Lỗi kiểm tra token:", error);
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }
}
