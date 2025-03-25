export const dynamic = 'force-dynamic';

import { db } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function PUT(request) {
  try {
    const { userId, ...userData } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "Thiếu ID người dùng" },
        { status: 400 }
      );
    }

    // Xử lý dữ liệu trước khi cập nhật
    const updateData = {
      ...userData,
      updatedAt: new Date().toISOString(),
    };

    // Xử lý trường phoneNumber
    if (userData.phoneNumber === "" || userData.phoneNumber === null) {
      // Nếu phoneNumber là chuỗi rỗng hoặc null, xóa khỏi object cập nhật
      delete updateData.phoneNumber;
      
      // Xóa phoneNumber trong Firestore (nếu có)
      await db.collection("users").doc(userId).update({
        phoneNumber: null,
      });
    } else if (userData.phoneNumber) {
      // Đảm bảo định dạng chuẩn E.164
      if (!userData.phoneNumber.startsWith('+')) {
        if (userData.phoneNumber.startsWith('0')) {
          updateData.phoneNumber = '+84' + userData.phoneNumber.substring(1);
        } else {
          updateData.phoneNumber = '+84' + userData.phoneNumber;
        }
      }
    }

    const userRef = db.collection("users").doc(userId);
    await userRef.update(updateData);

    const updatedDoc = await userRef.get();
    const updatedUser = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
    };

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error("Lỗi khi cập nhật người dùng:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật thông tin người dùng: " + error.message },
      { status: 500 }
    );
  }
}
