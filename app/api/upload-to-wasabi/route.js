export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

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
 * API để lấy URL ký để upload trực tiếp lên Wasabi
 * Method: POST
 * Body: {
 *   fileName: string (optional),
 *   fileType: string (Content-Type),
 *   fileSize: number (optional)
 * }
 */
export async function POST(request) {
  try {
    const { fileName, fileType, fileSize } = await request.json();

    if (!fileType) {
      return NextResponse.json(
        {
          error: "Thiếu thông tin loại file (fileType)",
        },
        { status: 400 }
      );
    }

    // Tạo unique key cho file
    const uniqueFileName =
      fileName || `${uuidv4()}${getFileExtension(fileType)}`;
    const key = `videos/${Date.now()}-${uniqueFileName}`;

    // Tạo command để upload
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: fileType,
    });

    // Tạo signed URL để upload trực tiếp
    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // URL có hiệu lực trong 1 giờ
    });

    // Tạo URL công khai sau khi file được upload
    const publicUrl = `https://${BUCKET_NAME}.s3.${
      process.env.WASABI_REGION || "ap-southeast-1"
    }.wasabisys.com/${key}`;

    // Trả về URL để upload và URL để truy cập file
    return NextResponse.json({
      success: true,
      uploadUrl: signedUrl,
      fileUrl: publicUrl,
      key: key,
    });
  } catch (error) {
    console.error("Lỗi khi tạo upload URL:", error);
    return NextResponse.json(
      {
        error: "Không thể tạo upload URL",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * API để lấy thông tin file đã upload
 * Method: GET
 * Query params: key - key của file trên Wasabi
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        {
          error: "Thiếu thông tin key của file",
        },
        { status: 400 }
      );
    }

    // Tạo command để lấy thông tin file
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      // Kiểm tra xem file có tồn tại không
      await s3Client.send(command);

      // Nếu không có lỗi, tạo URL công khai
      const publicUrl = `https://${BUCKET_NAME}.s3.${
        process.env.WASABI_REGION || "ap-southeast-1"
      }.wasabisys.com/${key}`;

      return NextResponse.json({
        success: true,
        fileUrl: publicUrl,
        key: key,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: "File không tồn tại hoặc không thể truy cập",
          detail: error.message,
        },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra file:", error);
    return NextResponse.json(
      {
        error: "Không thể kiểm tra file",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Hàm trợ giúp để lấy phần mở rộng file từ Content-Type
 */
function getFileExtension(contentType) {
  const mapping = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "application/pdf": ".pdf",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      ".xlsx",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      ".docx",
    "text/plain": ".txt",
    "text/csv": ".csv",
  };

  return mapping[contentType] || "";
}
