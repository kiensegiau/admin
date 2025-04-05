import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { findDocuments } from "@/lib/db";

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

    const formattedCourses = courses.map(course => ({
      id: course._id.toString(),
      title: course.title || "Khóa học không tên",
      chaptersCount: course.totalSections || 0,
      lessonsCount: course.totalLessons || 0,
      updatedAt: course.updatedAt,
      status: course.status || "draft",
      driveUrl: course.driveUrl || null,
      driveFolderId: course.driveFolderId || null,
      price: course.price || 0,
      teacher: course.teacher || "",
      subject: course.subject || "other",
      grade: course.grade || "grade10",
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
