export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
 * API để upload file trực tiếp từ server lên Wasabi
 * Method: POST
 * Body: FormData với field 'file'
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const customFilename = formData.get("filename");
    const folder = formData.get("folder") || "videos";

    if (!file) {
      return NextResponse.json(
        { error: "Vui lòng chọn file để tải lên" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Tạo tên file ngẫu nhiên nếu không có tên tùy chỉnh
    const contentType = file.type;
    const originalFilename = file.name;
    const fileExtension =
      getFileExtension(contentType) ||
      getExtensionFromFilename(originalFilename);
    const fileName = customFilename || `${uuidv4()}${fileExtension}`;

    // Tạo key cho file
    const key = `${folder}/${Date.now()}-${fileName}`;

    // Upload file trực tiếp lên Wasabi
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);

    // Tạo URL công khai
    const publicUrl = `https://${BUCKET_NAME}.s3.${
      process.env.WASABI_REGION || "ap-southeast-1"
    }.wasabisys.com/${key}`;

    return NextResponse.json({
      success: true,
      fileUrl: publicUrl,
      key: key,
      fileName: fileName,
      size: file.size,
      contentType: contentType,
    });
  } catch (error) {
    console.error("Lỗi khi tải file lên Wasabi:", error);
    return NextResponse.json(
      {
        error: "Không thể tải file lên Wasabi",
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

/**
 * Hàm trợ giúp để lấy phần mở rộng từ tên file
 */
function getExtensionFromFilename(filename) {
  const parts = filename.split(".");
  if (parts.length > 1) {
    return `.${parts[parts.length - 1]}`;
  }
  return "";
}
