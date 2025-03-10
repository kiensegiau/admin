export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

// Helper function để kiểm tra file tồn tại không
async function doesFileExist(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * API để tạo link chia sẻ có thời hạn
 * Method: GET
 * Params:
 *   - key: Key của file trên Wasabi
 *   - expires: Thời gian hết hạn tính bằng giây (mặc định: 3600s = 1 giờ)
 * Returns:
 *   - shareUrl: URL tạm thời để chia sẻ file
 *   - expiresAt: Thời gian URL hết hạn
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    let expires = searchParams.get("expires") || 3600; // Mặc định 1 giờ

    // Chuyển đổi expires sang số nguyên
    expires = parseInt(expires, 10);

    // Giới hạn thời gian tối đa là 7 ngày (604800 giây)
    if (isNaN(expires) || expires <= 0) {
      expires = 3600; // Mặc định 1 giờ nếu không hợp lệ
    } else if (expires > 604800) {
      expires = 604800; // Tối đa 7 ngày
    }

    if (!key) {
      return NextResponse.json(
        {
          error: "Thiếu thông tin key của file",
        },
        { status: 400 }
      );
    }

    // Kiểm tra xem file có tồn tại không
    const fileExists = await doesFileExist(key);
    if (!fileExists) {
      return NextResponse.json(
        {
          error: "File không tồn tại",
        },
        { status: 404 }
      );
    }

    // Tạo command để lấy file
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    // Tạo signed URL để chia sẻ file
    const shareUrl = await getSignedUrl(s3Client, command, {
      expiresIn: expires,
    });

    // Tính thời gian hết hạn
    const expiresAt = new Date(Date.now() + expires * 1000).toISOString();

    return NextResponse.json({
      success: true,
      shareUrl,
      expiresAt,
      expiresIn: expires,
    });
  } catch (error) {
    console.error("Lỗi khi tạo link chia sẻ:", error);
    return NextResponse.json(
      {
        error: "Không thể tạo link chia sẻ",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}
