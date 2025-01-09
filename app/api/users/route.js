import { db } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    if (!db) {
      throw new Error("Firestore chưa được khởi tạo");
    }

    const usersSnapshot = await db.collection("users").get();

    if (!usersSnapshot) {
      throw new Error("Không thể lấy dữ liệu từ Firestore");
    }

    const users = usersSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Lỗi chi tiết:", error);
    return NextResponse.json(
      { error: `Không thể lấy danh sách người dùng: ${error.message}` },
      { status: 500 }
    );
  }
}
