export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { CourseAdapter } from "@/lib/adapters/course-adapter";
import slugify from "slugify";

export async function POST(request) {
  try {
    const { title, price = 0, teacher = "", subject = "other", grade = "grade10", driveUrl = null } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: "Tên khóa học không được để trống" },
        { status: 400 }
      );
    }

    // Tạo đối tượng khóa học mới theo cấu trúc cũ
    const legacyCourse = {
      title,
      price: Number(price),
      teacher,
      subject,
      grade,
      chapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      description: "",
      shortDescription: "",
      status: "draft",
      totalLessons: 0,
      totalChapters: 0,
      slug: slugify(title, { lower: true }),
    };

    // Thêm driveUrl và trích xuất driveFolderId nếu có
    if (driveUrl) {
      legacyCourse.driveUrl = driveUrl;
      
      // Trích xuất ID của thư mục từ Drive URL (nếu cần)
      const driveFolderId = extractDriveId(driveUrl);
      if (driveFolderId) {
        legacyCourse.driveFolderId = driveFolderId;
      }
    }

    // Sử dụng CourseAdapter để lưu vào MongoDB với cấu trúc mới
    const courseId = await CourseAdapter.importFromLegacyStructure(legacyCourse);
    console.log(`Đã tạo khóa học mới với ID: ${courseId}`);

    return NextResponse.json({
      success: true,
      course: {
        id: courseId,
        title: legacyCourse.title
      },
      message: "Tạo khóa học thành công"
    });
  } catch (error) {
    console.error("Lỗi khi tạo khóa học:", error);
    return NextResponse.json(
      { error: "Không thể tạo khóa học: " + error.message },
      { status: 500 }
    );
  }
}

// Hàm để trích xuất ID thư mục Drive từ URL
function extractDriveId(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    const pathSegments = urlObj.pathname.split('/');
    
    // Google Drive URL có định dạng: https://drive.google.com/drive/folders/{folderId}
    if (urlObj.hostname === 'drive.google.com' && pathSegments.includes('folders')) {
      const folderIndex = pathSegments.indexOf('folders');
      if (folderIndex !== -1 && folderIndex < pathSegments.length - 1) {
        return pathSegments[folderIndex + 1];
      }
    }
    
    return null;
  } catch (e) {
    console.error("Lỗi khi phân tích URL Drive:", e);
    return null;
  }
} 