import { NextResponse } from "next/server";
import { readTokens } from "@/lib/tokenStorage";
import { refreshDriveToken } from "@/lib/tokenRefresher";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Đọc token từ storage
    const tokens = await readTokens();

    // Kiểm tra nếu không có token
    if (!tokens) {
      return NextResponse.json(
        { valid: false, error: "Không tìm thấy token Google Drive" },
        { status: 404 }
      );
    }

    // Kiểm tra token có hết hạn chưa
    const now = Date.now();
    if (tokens.expiry_date && now >= tokens.expiry_date) {
      console.log("Token đã hết hạn, thử làm mới tự động...");

      // Thử làm mới token
      const refreshedTokens = await refreshDriveToken();

      if (refreshedTokens) {
        console.log("Đã làm mới token thành công");
        return NextResponse.json({
          valid: true,
          message: "Token đã được làm mới thành công",
          expiry_date: refreshedTokens.expiry_date,
        });
      } else {
        console.log("Không thể làm mới token");
        return NextResponse.json(
          {
            valid: false,
            error: "Token đã hết hạn và không thể làm mới tự động",
            expiry_date: tokens.expiry_date,
          },
          { status: 401 }
        );
      }
    }

    // Token còn hiệu lực
    const timeLeft = tokens.expiry_date - now;
    const minutesLeft = Math.floor(timeLeft / (60 * 1000));

    return NextResponse.json({
      valid: true,
      message: `Token còn hiệu lực trong ${minutesLeft} phút`,
      expiry_date: tokens.expiry_date,
    });
  } catch (error) {
    console.error("Lỗi khi kiểm tra token:", error);
    return NextResponse.json(
      { valid: false, error: `Lỗi kiểm tra token: ${error.message}` },
      { status: 500 }
    );
  }
}
