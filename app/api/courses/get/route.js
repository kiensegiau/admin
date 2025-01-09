import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("id");

    if (!courseId) {
      return NextResponse.json(
        { error: "Course ID is required" },
        { status: 400 }
      );
    }

    if (!db) {
      throw new Error("Firestore chưa được khởi tạo");
    }

    const courseDoc = await db.collection("courses").doc(courseId).get();

    if (!courseDoc.exists) {
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: courseDoc.id,
      ...courseDoc.data(),
    });
  } catch (error) {
    console.error("Error getting course:", error);
    return NextResponse.json(
      { error: "Không thể lấy thông tin khóa học" },
      { status: 500 }
    );
  }
}
