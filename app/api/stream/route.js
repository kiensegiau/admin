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

const BUCKET_NAME = process.env.WASABI_BUCKET_NAME || "hocmai";

// Kiểm tra xem file có tồn tại trong Wasabi không
async function checkFileExists(key) {
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

// Kiểm tra xem file có phải video không
function isVideoFile(key) {
  return key.match(/\.(mp4|webm|mov|ogg|avi|mkv)$/i) !== null;
}

/**
 * API để lấy URL streaming video từ Wasabi
 * Method: GET
 * Query params:
 *   - key: Key của file trong Wasabi (bắt buộc)
 *   - expires: Thời gian hết hạn (giây, mặc định: 21600 = 6 giờ)
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    let expires = parseInt(searchParams.get("expires") || "21600", 10); // Mặc định 6 giờ

    // Validate input
    if (!key) {
      return NextResponse.json(
        {
          error: "Thiếu key của file",
        },
        { status: 400 }
      );
    }

    // Giới hạn thời gian tối đa là 24 giờ
    if (isNaN(expires) || expires <= 0) {
      expires = 21600; // Mặc định 6 giờ
    } else if (expires > 86400) {
      expires = 86400; // Tối đa 24 giờ
    }

    // Kiểm tra file tồn tại không
    const fileExists = await checkFileExists(key);
    if (!fileExists) {
      return NextResponse.json(
        {
          error: "File không tồn tại trên Wasabi",
        },
        { status: 404 }
      );
    }

    // Nếu cần phát video, kiểm tra đây có phải file video không
    if (isVideoFile(key)) {
      // Tạo URL signed cho video
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      const streamUrl = await getSignedUrl(s3Client, command, {
        expiresIn: expires,
      });

      // Ghi log lượt xem
      console.log(`Streaming video: ${key}`);

      // Trả về URL streaming
      return NextResponse.json({
        success: true,
        streamUrl,
        expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
      });
    } else {
      return NextResponse.json(
        {
          error: "File không phải định dạng video hỗ trợ",
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Lỗi khi lấy URL streaming:", error);
    return NextResponse.json(
      {
        error: "Không thể lấy URL streaming",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}
