import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  try {
    // Xóa session cookie
    cookies().delete("session");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lỗi đăng xuất:", error);
    return NextResponse.json({ error: "Đăng xuất thất bại" }, { status: 500 });
  }
}
