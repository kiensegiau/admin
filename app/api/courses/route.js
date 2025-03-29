import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    // Lấy danh sách tất cả các khóa học từ Firestore
    const coursesRef = db.collection("courses");
    const snapshot = await coursesRef.get();

    if (snapshot.empty) {
      return NextResponse.json({ courses: [] });
    }

    const courses = [];
    snapshot.forEach((doc) => {
      const courseData = doc.data();
      courses.push({
        id: doc.id,
        title: courseData.title || "Khóa học không tên",
        chaptersCount: courseData.chapters?.length || 0,
        lessonsCount: courseData.totalLessons || 0,
        updatedAt: courseData.updatedAt,
        status: courseData.status || "draft",
        driveUrl: courseData.driveUrl || null,
        driveFolderId: courseData.driveFolderId || null,
        price: courseData.price || 0,
        teacher: courseData.teacher || "",
        subject: courseData.subject || "other",
        grade: courseData.grade || "grade10",
      });
    });

    // Sắp xếp khóa học theo thời gian cập nhật mới nhất
    courses.sort((a, b) => {
      if (!a.updatedAt) return 1;
      if (!b.updatedAt) return -1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });

    return NextResponse.json({ courses });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách khóa học:", error);
    return NextResponse.json(
      { error: "Không thể lấy danh sách khóa học: " + error.message },
      { status: 500 }
    );
  }
}
