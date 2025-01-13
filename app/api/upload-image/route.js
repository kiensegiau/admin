export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase-admin";

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
    const bucket = adminStorage.bucket();
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
