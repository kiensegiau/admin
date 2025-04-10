export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { findDocuments } from "@/lib/db";

export async function GET() {
  try {
    console.log("Bắt đầu lấy danh sách khóa học từ MongoDB");
    
    // Lấy tất cả khóa học từ MongoDB
    const coursesData = await findDocuments("courses");
    console.log("Số lượng khóa học tìm thấy:", coursesData.length);
    
    // Log chi tiết về dữ liệu
    coursesData.forEach((course, index) => {
      if (course._id.toString() === "67f3bb713c71dc386575eed8") {
        console.log("=============================================");
        console.log("Dữ liệu khóa học ID 67f3bb713c71dc386575eed8:");
        console.log("grade:", course.grade, "- Kiểu:", typeof course.grade);
        console.log("subject:", course.subject, "- Kiểu:", typeof course.subject);
        console.log("Toàn bộ dữ liệu:", JSON.stringify(course, null, 2));
        console.log("=============================================");
      }
    });
    
    // Định dạng kết quả trả về giống như API trước đây
    const courses = coursesData.map(course => {
      // Đảm bảo không ghi đè giá trị subject và grade nếu đã có trong DB
      const hasSubject = course.subject !== undefined && course.subject !== null;
      const hasGrade = course.grade !== undefined && course.grade !== null;
      
      // Kiểm tra kiểu dữ liệu
      const originalGrade = course.grade;
      const originalSubject = course.subject;
      
      const mappedCourse = {
        id: course._id.toString(),
        title: course.title || "",
        description: course.description || "",
        thumbnail: course.thumbnail || "",
        price: course.price || 0,
        discountPrice: course.discountPrice || 0,
        status: course.status || "draft",
        teacher: course.teacher || "",
        subject: hasSubject ? course.subject : "other",
        grade: hasGrade ? course.grade : "other",
        driveUrl: course.driveUrl || null,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt
      };
      
      // Log chi tiết nếu là khóa học cần kiểm tra
      if (course._id.toString() === "67f3bb713c71dc386575eed8") {
        console.log("Sau khi mapping:");
        console.log("- Original grade:", originalGrade, "- Kiểu:", typeof originalGrade);
        console.log("- Mapped grade:", mappedCourse.grade, "- Kiểu:", typeof mappedCourse.grade);
        console.log("- Original subject:", originalSubject, "- Kiểu:", typeof originalSubject);
        console.log("- Mapped subject:", mappedCourse.subject, "- Kiểu:", typeof mappedCourse.subject);
      }
      
      return mappedCourse;
    });
    
    // Kiểm tra một lần nữa sau khi mapping
    const targetCourse = courses.find(c => c.id === "67f3bb713c71dc386575eed8");
    if (targetCourse) {
      console.log("Khóa học sau khi xử lý API:", targetCourse);
      console.log("- Grade:", targetCourse.grade, "- Kiểu:", typeof targetCourse.grade);
      console.log("- Subject:", targetCourse.subject, "- Kiểu:", typeof targetCourse.subject);
    }

    return NextResponse.json({ courses });
  } catch (error) {
    console.error("Error getting courses from MongoDB:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
