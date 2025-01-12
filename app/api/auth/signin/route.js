import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function POST(request) {
  try {
    console.log("Bắt đầu xử lý signin request");

    if (!request.body) {
      console.error("Request body trống");
      return NextResponse.json(
        { error: "Request body không hợp lệ" },
        { status: 400 }
      );
    }

    const { idToken } = await request.json();

    if (!idToken) {
      console.error("idToken không tồn tại");
      return NextResponse.json(
        { error: "idToken là bắt buộc" },
        { status: 400 }
      );
    }

    // Verify token và lấy thông tin user
    const decodedToken = await auth.verifyIdToken(idToken);

    // Kiểm tra email
    if (decodedToken.email !== "phanhuukien2001@gmail.com") {
      console.error("Email không được phép truy cập:", decodedToken.email);
      return NextResponse.json(
        { error: "Bạn không có quyền truy cập" },
        { status: 403 }
      );
    }

    console.log("Tạo session cookie...");
    // Tạo session cookie
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn,
    });

    console.log("Thiết lập cookie...");
    // Thiết lập cookie
    cookies().set("session", sessionCookie, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    console.log("Signin thành công");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lỗi chi tiết khi đăng nhập:", error);

    // Kiểm tra lỗi cụ thể từ Firebase Admin
    if (error.code === "auth/invalid-id-token") {
      return NextResponse.json(
        { error: "Token không hợp lệ hoặc đã hết hạn" },
        { status: 401 }
      );
    }

    if (error.code === "auth/session-cookie-expired") {
      return NextResponse.json(
        { error: "Session đã hết hạn" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Lỗi server: " + error.message },
      { status: 500 }
    );
  }
}
