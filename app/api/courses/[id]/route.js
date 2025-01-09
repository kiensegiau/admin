import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function GET(request, { params }) {
  try {
    const courseId = params.id;
    console.log("\n=== Bắt đầu lấy thông tin khóa học ===");
    console.log("CourseID:", courseId);

    if (!courseId) {
      console.log("Lỗi: Thiếu ID khóa học");
      return NextResponse.json({ error: "Thiếu ID khóa học" }, { status: 400 });
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    console.log("Course exists:", courseDoc.exists);
    if (!courseDoc.exists) {
      console.log("Lỗi: Không tìm thấy khóa học với ID", courseId);
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    const courseData = courseDoc.data();
    console.log("Raw course data:", JSON.stringify(courseData, null, 2));

    // Format dữ liệu trả về
    const formattedCourse = {
      id: courseDoc.id,
      title: courseData.title || "",
      description: courseData.description || "",
      teacher: courseData.teacher || "",
      subject: courseData.subject || "",
      grade: courseData.grade || "",
      price: courseData.price || 0,
      status: courseData.status || "draft",
      totalLessons: courseData.totalLessons || 0,
      totalChapters: courseData.totalChapters || 0,
      createdAt: courseData.createdAt || "",
      updatedAt: courseData.updatedAt || "",
      chapters: (courseData.chapters || []).map((chapter) => {
        console.log("Processing chapter:", chapter.id);
        return {
          id: chapter.id,
          title: chapter.title || "",
          order: chapter.order || 0,
          totalLessons: chapter.totalLessons || 0,
          createdAt: chapter.createdAt || "",
          updatedAt: chapter.updatedAt || "",
          lessons: (chapter.lessons || []).map((lesson) => {
            console.log("Processing lesson:", lesson.id);
            return {
              id: lesson.id,
              title: lesson.title || "",
              order: lesson.order || 0,
              files: (lesson.files || []).map((file) => {
                console.log("Processing file:", file.name);
                return {
                  id: file.id,
                  name: file.name || "",
                  originalName: file.originalName || "",
                  mimeType: file.mimeType || "",
                  type: file.type || "",
                  size: file.size || "0",
                  proxyUrl: file.proxyUrl || "",
                  status: file.status || "active",
                  uploadTime: file.uploadTime || "",
                };
              }),
            };
          }),
        };
      }),
    };

    console.log("Formatted course:", JSON.stringify(formattedCourse, null, 2));
    console.log("=== Kết thúc lấy thông tin khóa học ===\n");

    return NextResponse.json({
      success: true,
      course: formattedCourse,
    });
  } catch (error) {
    console.error("Lỗi chi tiết khi lấy thông tin khóa học:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi lấy thông tin khóa học",
      },
      { status: 500 }
    );
  }
}
