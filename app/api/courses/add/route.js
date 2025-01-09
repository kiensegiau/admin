import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(request) {
  try {
    const courseData = await request.json();

    if (!courseData) {
      return NextResponse.json(
        { error: "Dữ liệu khóa học không hợp lệ" },
        { status: 400 }
      );
    }

    const docRef = await adminDb.collection("courses").add({
      ...courseData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      courseId: docRef.id,
    });
  } catch (error) {
    console.error("Error adding course:", error);
    return NextResponse.json(
      { error: "Không thể thêm khóa học" },
      { status: 500 }
    );
  }
}
