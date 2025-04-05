export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { insertDocument } from "@/lib/db";
import { auth } from "@/lib/firebase-admin"; // Giữ lại auth để tích hợp với Firebase Auth
import { ObjectId } from 'mongodb';

export async function POST(request) {
  try {
    const { email, password, fullName, phoneNumber, role, ...profileData } = await request.json();

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

    // Tạo một MongoDB ObjectId cho người dùng
    const userId = new ObjectId();

    // Chuẩn bị dữ liệu cho MongoDB - Collection users
    const userData = {
      _id: userId,
      uid: userRecord.uid,
      email: userRecord.email,
      fullName,
      phoneNumber: phoneNumber || null,
      isActive: true,
      role: role || 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Thêm thông tin cơ bản vào MongoDB
    await insertDocument("users", userData);

    // Chuẩn bị dữ liệu cho MongoDB - Collection userProfiles
    const userProfile = {
      userId,
      avatar: profileData.avatar || null,
      address: profileData.address || null,
      bio: profileData.bio || null,
      dateOfBirth: profileData.dateOfBirth || null,
      socialLinks: profileData.socialLinks || {},
      preferences: profileData.preferences || {
        theme: 'light',
        notifications: true
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Thêm thông tin profile nếu có
    await insertDocument("userProfiles", userProfile);

    // Chuẩn bị dữ liệu cho MongoDB - Collection userFinances
    const userFinance = {
      userId,
      balance: 0,
      totalDeposit: 0,
      totalSpent: 0,
      paymentMethods: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Thêm thông tin tài chính
    await insertDocument("userFinances", userFinance);

    // Chuẩn bị dữ liệu phản hồi
    const responseData = {
      id: userId.toString(),
      uid: userRecord.uid,
      email: userRecord.email,
      fullName,
      phoneNumber: phoneNumber || null,
      isActive: true,
      role: role || 'user',
      profile: {
        avatar: userProfile.avatar,
        address: userProfile.address,
        bio: userProfile.bio,
      },
      finance: {
        balance: userFinance.balance
      }
    };

    return NextResponse.json({ user: responseData }, { status: 201 });
  } catch (error) {
    console.error("Lỗi khi thêm người dùng:", error);
    return NextResponse.json(
      { error: "Không thể thêm người dùng mới: " + error.message },
      { status: 500 }
    );
  }
}
