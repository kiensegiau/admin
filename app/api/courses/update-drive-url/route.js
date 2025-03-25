export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { extractDriveId } from "@/app/utils/serverDriveUtils";
import {
  initializeDriveClient,
  getFolderInfo,
} from "@/app/utils/serverDriveUtils";

export async function POST(request) {
  try {
    const { courseId, driveUrl, updateTitle = false } = await request.json();

    // Kiểm tra đầu vào
    if (!courseId) {
      return NextResponse.json({ error: "Thiếu courseId" }, { status: 400 });
    }

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

    // Kiểm tra khóa học tồn tại
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    const courseData = courseDoc.data();

    // Khởi tạo Google Drive client và lấy thông tin thư mục
    try {
      const drive = await initializeDriveClient();
      const folderInfo = await getFolderInfo(drive, folderId);

      if (!folderInfo) {
        return NextResponse.json(
          {
            error:
              "Không thể lấy thông tin thư mục từ Drive hoặc không có quyền truy cập",
            success: false,
          },
          { status: 403 }
        );
      }

      // Cập nhật thông tin khóa học
      const updateData = {
        driveUrl: driveUrl,
        driveFolderId: folderId,
        updatedAt: new Date().toISOString(),
      };

      // Cập nhật tiêu đề nếu được yêu cầu hoặc nếu tiêu đề hiện tại đang trống
      let titleUpdated = false;
      if (updateTitle || !courseData.title) {
        updateData.title = folderInfo.name;
        titleUpdated = true;
      }

      // Cập nhật Drive URL trong database
      await courseRef.update(updateData);

      console.log(
        `Đã cập nhật Drive URL cho khóa học ${courseId}: ${driveUrl}`
      );
      if (titleUpdated) {
        console.log(`Đã cập nhật tên khóa học: ${folderInfo.name}`);
      }

      return NextResponse.json({
        success: true,
        message: `Đã cập nhật Drive URL thành công${
          titleUpdated
            ? ` và cập nhật tên khóa học thành "${folderInfo.name}"`
            : ""
        }`,
        folderName: folderInfo.name,
        titleUpdated,
      });
    } catch (error) {
      console.error("Lỗi khi lấy thông tin từ Google Drive:", error);

      // Vẫn cập nhật Drive URL nếu không thể lấy thông tin từ Drive
      await courseRef.update({
        driveUrl: driveUrl,
        driveFolderId: folderId,
        updatedAt: new Date().toISOString(),
      });

      return NextResponse.json({
        success: true,
        message:
          "Đã cập nhật Drive URL thành công, nhưng không thể lấy thông tin thư mục từ Drive",
        warning: error.message,
      });
    }
  } catch (error) {
    console.error("Lỗi khi cập nhật Drive URL:", error);
    return NextResponse.json(
      {
        error: error.message || "Có lỗi xảy ra khi cập nhật Drive URL",
        success: false,
      },
      { status: 500 }
    );
  }
}
