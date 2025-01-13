import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const session = cookies().get("session")?.value;
    if (!session) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const decodedClaims = await auth.verifySessionCookie(session, true);
    console.log("Decoded claims:", {
      email: decodedClaims.email,
      uid: decodedClaims.uid,
    });
    return NextResponse.json({
      isAuthenticated: true,
      email: decodedClaims.email,
      uid: decodedClaims.uid,
    });
  } catch (error) {
    console.error("Auth error:", error);
    return NextResponse.json(
      { error: "Phiên đăng nhập không hợp lệ" },
      { status: 401 }
    );
  }
}
