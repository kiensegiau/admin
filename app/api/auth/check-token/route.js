import { NextResponse } from "next/server";
import { checkAuthStatus } from "@/lib/auth";

export async function GET() {
  console.log("=== API CHECK TOKEN ===");
  console.log("Nhận request kiểm tra token");

  try {
    const authStatus = await checkAuthStatus();
    console.log("Kết quả kiểm tra:", authStatus);

    return NextResponse.json({
      isConnected: authStatus.isAuthenticated,
      token: authStatus.accessToken,
      user: authStatus.user,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Lỗi trong API check-token:", error);
    return NextResponse.json(
      {
        error: "Lỗi kiểm tra token",
        details: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
