import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { idToken } = await request.json();
    if (!idToken) {
      return NextResponse.json(
        { error: "Thiếu token xác thực" },
        { status: 400 }
      );
    }

    // Tạo session cookie với thời hạn 5 ngày
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days in milliseconds
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn,
    });

    // Verify token để lấy thông tin user
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // So sánh email sau khi đã chuẩn hóa
    const userEmail = decodedToken.email?.trim().toLowerCase();
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const isAdmin = userEmail === adminEmail;
    
    console.log(`🔐 Đăng nhập: Email=${decodedToken.email}, ADMIN_EMAIL=${process.env.ADMIN_EMAIL}, isAdmin=${isAdmin}`);
    console.log(`📊 So sánh email: '${userEmail}' === '${adminEmail}'`);

    // Set cookie với các options phù hợp
    const cookieOptions = {
      maxAge: expiresIn / 1000, // Convert to seconds
      httpOnly: true,
      secure: false, // Tắt secure để hoạt động trên HTTP localhost
      path: "/",
      sameSite: "lax",
    };

    console.log("Setting cookie with options:", cookieOptions);
    cookies().set("session", sessionCookie, cookieOptions);

    // Thêm cookie không httpOnly để kiểm tra xem cookie đã được set hay chưa
    cookies().set("session_check", "true", {
      maxAge: expiresIn / 1000,
      httpOnly: false,
      secure: false, // Tắt secure để hoạt động trên HTTP localhost
      path: "/",
      sameSite: "lax",
    });

    return NextResponse.json({ 
      success: true, 
      isAdmin,
      email: decodedToken.email,
      adminEmail: process.env.ADMIN_EMAIL,
    });
  } catch (error) {
    console.error("Auth error:", error);
    if (error.code === "auth/invalid-id-token") {
      return NextResponse.json(
        { error: "Token không hợp lệ hoặc đã hết hạn" },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: "Lỗi xác thực" }, { status: 500 });
  }
}
