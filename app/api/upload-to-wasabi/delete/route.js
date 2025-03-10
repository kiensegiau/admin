export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

// Khởi tạo Wasabi client
const s3Client = new S3Client({
  region: process.env.WASABI_REGION || "ap-southeast-1", // Singapore region
  endpoint:
    process.env.WASABI_ENDPOINT || "https://s3.ap-southeast-1.wasabisys.com",
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.WASABI_BUCKET_NAME;

/**
 * API để xóa file từ Wasabi
 * Method: POST
 * Body: { key: string } - key của file cần xóa
 */
export async function POST(request) {
  try {
    const { key } = await request.json();

    if (!key) {
      return NextResponse.json(
        { error: "Thiếu thông tin key của file cần xóa" },
        { status: 400 }
      );
    }

    // Tạo command để xóa file
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    // Thực hiện xóa file
    await s3Client.send(command);

    return NextResponse.json({
      success: true,
      message: "Đã xóa file thành công",
      key: key,
    });
  } catch (error) {
    console.error("Lỗi khi xóa file từ Wasabi:", error);
    return NextResponse.json(
      {
        error: "Không thể xóa file",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}
