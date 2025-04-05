import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { findDocuments, findOneDocument } from "@/lib/db";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    // Tìm khóa học trong MongoDB thay vì Firestore
    let query = {};
    
    if (search) {
      // Tìm kiếm theo tên khóa học
      query = {
        title: { $regex: search, $options: 'i' }
      };
    }
    
    const courses = await findDocuments("courses", query);
    
    if (!courses || courses.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Loại bỏ các bản sao dựa trên tiêu đề khóa học
    // Tạo một Map để lưu khóa học mới nhất theo tiêu đề
    const uniqueCoursesMap = new Map();
    
    // Duyệt qua tất cả khóa học và chỉ giữ lại bản mới nhất
    courses.forEach(course => {
      const title = course.title || "Khóa học không tên";
      
      // Nếu chưa có khóa học này trong map hoặc khóa học này mới hơn
      if (!uniqueCoursesMap.has(title) || 
          new Date(course.updatedAt) > new Date(uniqueCoursesMap.get(title).updatedAt)) {
        uniqueCoursesMap.set(title, course);
      }
    });
    
    // Chuyển Map thành mảng các khóa học duy nhất
    const uniqueCourses = Array.from(uniqueCoursesMap.values());
    
    console.log(`Tìm thấy ${courses.length} khóa học, sau khi loại bỏ trùng lặp còn ${uniqueCourses.length}`);

    // Lấy dữ liệu nội dung khóa học (chapters/lessons) từ collection courseContents
    const formattedCourses = await Promise.all(uniqueCourses.map(async course => {
      // Tìm nội dung khóa học tương ứng
      const courseContent = await findOneDocument("courseContents", { 
        courseId: course._id 
      });
      
      return {
        id: course._id.toString(),
        title: course.title || "Khóa học không tên",
        chaptersCount: courseContent ? courseContent.sections.length : 0,
        lessonsCount: courseContent ? courseContent.totalLessons : 0,
        updatedAt: course.updatedAt,
        status: course.status || "draft",
        driveUrl: course.driveUrl || null,
        driveFolderId: course.driveFolderId || null,
        price: course.price || 0,
        discountPrice: course.discountPrice || 0,
        teacher: course.teacher || "",
        subject: course.subject || "other",
        grade: course.grade || "grade10",
        thumbnail: course.thumbnail || "",
        shortDescription: course.shortDescription || "",
      };
    }));

    // Sắp xếp khóa học theo thời gian cập nhật mới nhất
    formattedCourses.sort((a, b) => {
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return NextResponse.json({ data: formattedCourses });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách khóa học:", error);
    return NextResponse.json(
      { error: "Không thể lấy danh sách khóa học: " + error.message },
      { status: 500 }
    );
  }
}
