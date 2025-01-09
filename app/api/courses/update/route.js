import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request) {
  try {
    const { courseId, courseData } = await request.json();

    if (!courseId) {
      return NextResponse.json(
        { error: "Vui lòng chọn khóa học để cập nhật" },
        { status: 400 }
      );
    }

    if (!courseData) {
      return NextResponse.json(
        { error: "Dữ liệu cập nhật không hợp lệ" },
        { status: 400 }
      );
    }

    await adminDb.collection("courses").doc(courseId).update(courseData);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating course:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật khóa học" },
      { status: 500 }
    );
  }
}
