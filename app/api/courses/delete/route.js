import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function POST(request) {
  try {
    const { courseId } = await request.json();

    if (!courseId) {
      return NextResponse.json(
        { error: "Vui lòng chọn khóa học để xóa" },
        { status: 400 }
      );
    }

    if (!db) {
      throw new Error("Firestore chưa được khởi tạo");
    }

    await db.collection("courses").doc(courseId).delete();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting course:", error);
    return NextResponse.json(
      { error: "Không thể xóa khóa học" },
      { status: 500 }
    );
  }
}
