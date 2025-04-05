import { NextResponse } from "next/server";
import { findDocuments } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    // Tìm khóa học trong MongoDB
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

    // Format dữ liệu đồng nhất 100% với cấu trúc trong db.json
    const formattedCourses = uniqueCourses.map(course => {
      return {
        id: course._id.toString(),
        title: course.title || "Khóa học không tên",
        slug: course.slug || "",
        description: course.description || "",
        shortDescription: course.shortDescription || "",
        thumbnail: course.thumbnail || "",
        price: course.price || 0,
        discountPrice: course.discountPrice || 0,
        status: course.status || "draft",
        featured: course.featured || false,
        driveFolderId: course.driveFolderId || null,
        driveUrl: course.driveUrl || null,
        teacherId: course.teacherId || null,
        totalLessons: course.totalLessons || 0,
        chapters: course.chapters || [],
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
        firebaseId: course.firebaseId || null
      };
    });

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
