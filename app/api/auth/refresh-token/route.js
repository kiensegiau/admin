import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function POST() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get("session")?.value;

    if (!session) {
      return NextResponse.json({ error: "No session found" }, { status: 401 });
    }

    // Verify session cookie để lấy thông tin user
    const decodedClaims = await auth.verifySessionCookie(session);

    // Tạo custom token để làm mới session
    const customToken = await auth.createCustomToken(decodedClaims.uid);

    // Tạo session cookie mới
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const sessionCookie = await auth.createSessionCookie(customToken, {
      expiresIn,
    });

    // Thiết lập cookie mới
    cookies().set("session", sessionCookie, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lỗi làm mới token:", error);
    return NextResponse.json(
      { error: "Không thể làm mới token" },
      { status: 401 }
    );
  }
}
