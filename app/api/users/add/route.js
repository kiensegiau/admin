export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db, auth } from "@/lib/firebase-admin";

export async function POST(request) {
  try {
    const { email, password, fullName, phoneNumber } = await request.json();

    // Chuẩn bị dữ liệu cho Auth
    const authData = {
      email,
      password,
      displayName: fullName,
    };
    
    // Chỉ thêm phoneNumber vào nếu có giá trị hợp lệ
    if (phoneNumber) {
      authData.phoneNumber = phoneNumber;
    }

    // Tạo user trong Firebase Auth
    const userRecord = await auth.createUser(authData);

    // Chuẩn bị dữ liệu cho Firestore
    const firestoreData = {
      uid: userRecord.uid,
      email: userRecord.email,
      fullName,
      isActive: true,
      createdAt: new Date(),
    };
    
    // Chỉ thêm phoneNumber vào nếu có giá trị
    if (phoneNumber) {
      firestoreData.phoneNumber = phoneNumber;
    }

    // Thêm thông tin user vào Firestore
    const userDoc = await db.collection("users").add(firestoreData);

    // Chuẩn bị dữ liệu phản hồi
    const userData = {
      id: userDoc.id,
      uid: userRecord.uid,
      email: userRecord.email,
      fullName,
      isActive: true,
    };
    
    // Chỉ thêm phoneNumber vào phản hồi nếu có giá trị
    if (phoneNumber) {
      userData.phoneNumber = phoneNumber;
    }

    return NextResponse.json({ user: userData }, { status: 201 });
  } catch (error) {
    console.error("Lỗi khi thêm người dùng:", error);
    return NextResponse.json(
      { error: "Không thể thêm người dùng mới: " + error.message },
      { status: 500 }
    );
  }
}
