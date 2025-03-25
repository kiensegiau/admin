import { NextResponse } from "next/server";
import { readTokens } from "@/lib/tokenStorage";
import { refreshDriveToken } from "@/lib/tokenRefresher";
import { initializeDriveClient } from "@/app/utils/serverDriveUtils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Đọc token từ storage
    const tokens = await readTokens();
    console.log("Đọc tokens:", tokens ? "Tìm thấy" : "Không tìm thấy");

    if (!tokens) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy token Google Drive" },
        { status: 404 }
      );
    }

    // Kiểm tra token có hết hạn chưa
    const now = Date.now();
    if (tokens.expiry_date && now >= tokens.expiry_date) {
      console.log("Token đã hết hạn, đang tự động làm mới...");

      // Thử làm mới token
      const refreshedTokens = await refreshDriveToken();

      if (!refreshedTokens) {
        return NextResponse.json(
          {
            success: false,
            error: "Token đã hết hạn và không thể làm mới tự động",
          },
          { status: 401 }
        );
      }

      console.log("Đã làm mới token thành công");
    }

    // Khởi tạo Drive client
    console.log("Đang khởi tạo Drive client...");
    const drive = await initializeDriveClient();

    if (!drive) {
      return NextResponse.json(
        { success: false, error: "Không thể khởi tạo Google Drive client" },
        { status: 500 }
      );
    }

    console.log("Khởi tạo Drive client thành công");

    // Kiểm tra kết nối bằng cách gọi API đơn giản
    const response = await drive.about.get({
      fields: "user,storageQuota",
    });

    // Lấy thông tin người dùng và dung lượng lưu trữ
    const user = response.data.user;
    const quota = response.data.storageQuota;

    return NextResponse.json({
      success: true,
      message: "Kết nối Google Drive thành công",
      user: {
        displayName: user?.displayName,
        emailAddress: user?.emailAddress,
      },
      storage: {
        usage: quota?.usage
          ? Math.round(parseInt(quota.usage) / (1024 * 1024)) + " MB"
          : "Không xác định",
        limit: quota?.limit
          ? Math.round(parseInt(quota.limit) / (1024 * 1024 * 1024)) + " GB"
          : "Không xác định",
      },
      tokenExpiry: tokens.expiry_date,
    });
  } catch (error) {
    console.error("Lỗi khi kiểm tra kết nối Google Drive:", error);
    return NextResponse.json(
      { success: false, error: `Lỗi kết nối: ${error.message}` },
      { status: 500 }
    );
  }
}
