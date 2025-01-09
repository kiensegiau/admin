import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const ADMIN_EMAIL = "phanhuukien20001@gmail.com";
const ADMIN_PASSWORD = "admin123"; // Bạn nên thay đổi mật khẩu này

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Kiểm tra thông tin đăng nhập
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return new NextResponse(
        JSON.stringify({ error: "Email hoặc mật khẩu không đúng" }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Tạo session cookie
    const cookieStore = cookies();
    cookieStore.set("session", "admin", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 ngày
    });

    return new NextResponse(
      JSON.stringify({ message: "Đăng nhập thành công" }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Lỗi đăng nhập:", error);
    return new NextResponse(
      JSON.stringify({ error: "Có lỗi xảy ra khi đăng nhập" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
} 