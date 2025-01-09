import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    // Xóa cookie session
    cookies().delete("session");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lỗi khi đăng xuất:", error);
    return NextResponse.json({ error: "Không thể đăng xuất" }, { status: 500 });
  }
}
