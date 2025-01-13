export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db, auth } from "@/lib/firebase-admin";

export async function DELETE(request) {
  try {
    const { userId } = await request.json();

    // Lấy thông tin user từ Firestore
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    const userData = userDoc.data();

    // Xóa user trong Auth
    if (userData.uid) {
      await auth.deleteUser(userData.uid);
    }

    // Xóa user trong Firestore
    await db.collection("users").doc(userId).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Lỗi khi xóa người dùng:", error);
    return NextResponse.json(
      { error: "Không thể xóa người dùng: " + error.message },
      { status: 500 }
    );
  }
}
