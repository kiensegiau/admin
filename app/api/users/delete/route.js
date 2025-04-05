export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { deleteDocument, findOneDocument, deleteDocuments } from "@/lib/db";
import { ObjectId } from 'mongodb';
import { auth } from "@/lib/firebase-admin"; // Giữ lại auth để tích hợp với Firebase Auth

export async function DELETE(request) {
  try {
    const { userId } = await request.json();

    // Lấy thông tin user từ MongoDB
    const user = await findOneDocument("users", { _id: new ObjectId(userId) });
    if (!user) {
      return NextResponse.json(
        { error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    // Xóa tất cả giao dịch liên quan đến user
    await deleteDocuments("transactions", { userId: userId });
    
    // Xóa user trong Auth nếu có uid
    if (user.uid) {
      try {
        await auth.deleteUser(user.uid);
      } catch (authError) {
        console.error("Lỗi khi xóa tài khoản Auth:", authError);
        // Tiếp tục xóa dữ liệu MongoDB ngay cả khi xóa Auth thất bại
      }
    }

    // Xóa user trong MongoDB
    await deleteDocument("users", { _id: new ObjectId(userId) });

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
