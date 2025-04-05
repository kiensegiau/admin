export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { updateDocument, findOneDocument } from "@/lib/db";
import { ObjectId } from 'mongodb';

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
      updatedAt: new Date(),
    };

    // Xử lý trường phoneNumber
    if (userData.phoneNumber === "" || userData.phoneNumber === null) {
      // Nếu phoneNumber là chuỗi rỗng hoặc null, xóa khỏi object cập nhật
      delete updateData.phoneNumber;
      
      // Xóa phoneNumber trong MongoDB
      await updateDocument("users", { _id: new ObjectId(userId) }, {
        $unset: { phoneNumber: "" }
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

    // Cập nhật người dùng trong MongoDB
    await updateDocument(
      "users", 
      { _id: new ObjectId(userId) }, 
      { $set: updateData }
    );

    // Lấy thông tin người dùng đã cập nhật
    const updatedUser = await findOneDocument("users", { _id: new ObjectId(userId) });
    
    if (!updatedUser) {
      return NextResponse.json(
        { error: "Không tìm thấy người dùng sau khi cập nhật" },
        { status: 404 }
      );
    }

    // Định dạng lại dữ liệu trả về
    const formattedUser = {
      id: updatedUser._id.toString(),
      ...updatedUser
    };
    
    // Xóa trường _id để tránh trùng lặp với id
    delete formattedUser._id;

    return NextResponse.json({ user: formattedUser });
  } catch (error) {
    console.error("Lỗi khi cập nhật người dùng:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật thông tin người dùng: " + error.message },
      { status: 500 }
    );
  }
}
