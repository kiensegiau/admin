export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function POST(request) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json(
        { error: "No ID token provided" },
        { status: 400 }
      );
    }

    // Tạo session cookie
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn,
    });

    // Thiết lập cookie
    const response = NextResponse.json({ status: "success" });
    response.cookies.set("session", sessionCookie, {
      maxAge: expiresIn,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error("Lỗi refresh token:", error);
    return NextResponse.json(
      { error: "Failed to refresh token" },
      { status: 401 }
    );
  }
}
