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

    // Xóa tất cả giao dịch liên quan đến user
    const transactionsSnapshot = await db
      .collection("transactions")
      .where("userId", "==", userId)
      .get();
    
    // Xóa từng giao dịch
    const deleteTransactions = transactionsSnapshot.docs.map((doc) => 
      db.collection("transactions").doc(doc.id).delete()
    );
    
    // Thực hiện xóa đồng thời tất cả giao dịch
    if (deleteTransactions.length > 0) {
      await Promise.all(deleteTransactions);
    }

    // Xóa user trong Auth nếu có uid
    if (userData.uid) {
      try {
        await auth.deleteUser(userData.uid);
      } catch (authError) {
        console.error("Lỗi khi xóa tài khoản Auth:", authError);
        // Tiếp tục xóa dữ liệu Firestore ngay cả khi xóa Auth thất bại
      }
    }

    // Xóa user trong Firestore
    await db.collection("users").doc(userId).delete();

    return NextResponse.json({ 
      success: true,
      message: "Đã xóa người dùng và tất cả dữ liệu liên quan"
    });
  } catch (error) {
    console.error("Lỗi khi xóa người dùng:", error);
    return NextResponse.json(
      { error: "Không thể xóa người dùng: " + error.message },
      { status: 500 }
    );
  }
}
