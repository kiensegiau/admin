import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function GET() {
  try {
    console.log("Bắt đầu lấy danh sách khóa học");

    const coursesRef = db.collection("courses");
    const snapshot = await coursesRef.orderBy("createdAt", "desc").get();

    const courses = [];
    snapshot.forEach((doc) => {
      courses.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    console.log(`Đã lấy ${courses.length} khóa học`);

    return NextResponse.json({
      success: true,
      courses: courses,
    });
  } catch (error) {
    console.error("Lỗi khi lấy danh sách khóa học:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi lấy danh sách khóa học",
      },
      { status: 500 }
    );
  }
}
