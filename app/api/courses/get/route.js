export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { findDocuments } from "@/lib/db";

export async function GET() {
  try {
    console.log("Bắt đầu lấy danh sách khóa học từ MongoDB");
    
    // Lấy tất cả khóa học từ MongoDB
    const coursesData = await findDocuments("courses");
    
    // Log thông tin chi tiết để debug
    coursesData.slice(0, 5).forEach((course, index) => {
      console.log(`Khóa học ${index + 1} - Tiêu đề: "${course.title}"`);
      console.log(` - subject: ${course.subject} (type: ${typeof course.subject})`);
      console.log(` - grade: ${course.grade} (type: ${typeof course.grade})`);
      console.log(` - Các trường có trong document:`, Object.keys(course));
    });
    
    // Định dạng kết quả trả về giống như API trước đây
    const courses = coursesData.map(course => {
      return {
        id: course._id.toString(),
        title: course.title || "",
        description: course.description || "",
        thumbnail: course.thumbnail || "",
        price: course.price || 0,
        discountPrice: course.discountPrice || 0,
        status: course.status || "draft",
        teacher: course.teacher || "",
        subject: course.subject || "other",
        grade: course.grade || "other",
        driveUrl: course.driveUrl || null,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt
      };
    });

    return NextResponse.json({ courses });
  } catch (error) {
    console.error("Error getting courses from MongoDB:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
