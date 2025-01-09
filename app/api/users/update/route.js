import { db } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function PUT(request) {
  try {
    const { userId, data } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Thiếu ID người dùng" },
        { status: 400 }
      );
    }

    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      ...data,
      updatedAt: new Date().toISOString(),
    });

    const updatedDoc = await userRef.get();
    const updatedUser = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
    };

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Lỗi khi cập nhật người dùng:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật thông tin người dùng" },
      { status: 500 }
    );
  }
}
