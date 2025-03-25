export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  extractDriveId,
  initializeDriveClient,
  getFolderInfo,
} from "@/app/utils/serverDriveUtils";

export async function POST(request) {
  try {
    const { driveUrl } = await request.json();

    // Kiểm tra đầu vào
    if (!driveUrl) {
      return NextResponse.json({ error: "Thiếu driveUrl" }, { status: 400 });
    }

    // Kiểm tra URL Drive có hợp lệ không
    const folderId = extractDriveId(driveUrl);
    if (!folderId) {
      return NextResponse.json(
        { error: "URL Google Drive không hợp lệ" },
        { status: 400 }
      );
    }

    // Khởi tạo Google Drive client
    const drive = await initializeDriveClient();

    // Lấy thông tin thư mục
    const folderInfo = await getFolderInfo(drive, folderId);

    if (!folderInfo) {
      return NextResponse.json(
        {
          error: "Không thể lấy thông tin thư mục hoặc không có quyền truy cập",
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      folderName: folderInfo.name,
      folderId: folderId,
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin thư mục Google Drive:", error);
    return NextResponse.json(
      {
        error: error.message || "Có lỗi xảy ra khi kiểm tra thư mục Drive",
      },
      { status: 500 }
    );
  }
}
