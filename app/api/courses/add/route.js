import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function POST(request) {
  try {
    const courseData = await request.json();

    if (!courseData) {
      return NextResponse.json(
        { error: "Dữ liệu khóa học không hợp lệ" },
        { status: 400 }
      );
    }

    if (!db) {
      throw new Error("Firestore chưa được khởi tạo");
    }

    const docRef = await db.collection("courses").add({
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
