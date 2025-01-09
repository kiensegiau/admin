import { NextResponse } from "next/server";
import { db, auth } from "@/lib/firebase-admin";

export async function POST(request) {
  try {
    const { email, password, fullName, phoneNumber } = await request.json();

    // Tạo user trong Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: fullName,
      phoneNumber,
    });

    // Thêm thông tin user vào Firestore
    const userDoc = await db.collection("users").add({
      uid: userRecord.uid,
      email: userRecord.email,
      fullName,
      phoneNumber,
      isActive: true,
      createdAt: new Date(),
    });

    const userData = {
      id: userDoc.id,
      uid: userRecord.uid,
      email: userRecord.email,
      fullName,
      phoneNumber,
      isActive: true,
    };

    return NextResponse.json({ user: userData }, { status: 201 });
  } catch (error) {
    console.error("Lỗi khi thêm người dùng:", error);
    return NextResponse.json(
      { error: "Không thể thêm người dùng mới: " + error.message },
      { status: 500 }
    );
  }
}
