import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const session = cookies().get("session")?.value;
    if (!session) {
      console.log("❌ Không tìm thấy cookie session");
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    console.log("✅ Tìm thấy cookie session, đang xác thực...");
    
    try {
      const decodedClaims = await auth.verifySessionCookie(session, true);
      console.log("✅ Xác thực thành công, email:", decodedClaims.email);
      
      return NextResponse.json({
        isAuthenticated: true,
        email: decodedClaims.email,
        uid: decodedClaims.uid,
      });
    } catch (verifyError) {
      console.error("❌ Lỗi xác thực cookie:", verifyError);
      return NextResponse.json(
        { error: "Phiên đăng nhập không hợp lệ", details: verifyError.message },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("❌ Lỗi xử lý tổng thể:", error);
    return NextResponse.json(
      { error: "Lỗi server khi xác thực phiên", details: error.message },
      { status: 500 }
    );
  }
}
