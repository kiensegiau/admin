import { NextResponse } from "next/server";
import admin from "firebase-admin";

// Khởi tạo Firebase Admin nếu chưa được khởi tạo
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const bucket = admin.storage().bucket();

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "Vui lòng chọn file để tải lên" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Tạo tên file ngẫu nhiên
    const fileExtension = file.type.split("/")[1];
    const fileName = `course-covers/${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${fileExtension}`;

    // Tạo file trong bucket
    const fileUpload = bucket.file(fileName);

    // Upload file
    await fileUpload.save(buffer, {
      metadata: {
        contentType: file.type,
      },
    });

    // Tạo URL công khai
    await fileUpload.makePublic();

    // Lấy URL công khai
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("Lỗi khi tải file lên:", error);
    return NextResponse.json(
      { error: "Không thể tải file lên" },
      { status: 500 }
    );
  }
}
