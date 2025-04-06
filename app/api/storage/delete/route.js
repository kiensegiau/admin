import { NextResponse } from "next/server";
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

// Khởi tạo Wasabi client
const s3Client = new S3Client({
  region: process.env.WASABI_REGION || "ap-southeast-1", // Singapore region
  endpoint: process.env.WASABI_ENDPOINT || "https://s3.ap-southeast-1.wasabisys.com",
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.WASABI_BUCKET_NAME || "hocmai";

// API endpoint để xóa file từ Wasabi
export async function DELETE(request) {
  try {
    // Lấy key từ query params
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    
    if (!key) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Thiếu tham số key" 
        }, 
        { status: 400 }
      );
    }
    
    console.log(`Đang xóa file từ Wasabi: ${key}`);
    
    try {
      // Kiểm tra file có tồn tại không
      const headCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      
      try {
        await s3Client.send(headCommand);
      } catch (error) {
        // Nếu file không tồn tại, trả về thành công luôn
        if (error.name === 'NotFound' || error.Code === 'NotFound' || error.name === 'NoSuchKey') {
          console.log(`File không tồn tại trên Wasabi: ${key}`);
          return NextResponse.json({
            success: true,
            message: "File không tồn tại, không cần xóa",
            key: key
          });
        }
        throw error; // Ném lỗi khác để xử lý bên ngoài
      }
      
      // Xóa file từ Wasabi
      const deleteCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      
      await s3Client.send(deleteCommand);
      
      console.log(`Đã xóa file thành công từ Wasabi: ${key}`);
      
      return NextResponse.json({
        success: true,
        message: "Đã xóa file thành công",
        key: key
      });
    } catch (error) {
      console.error(`Lỗi khi xóa file từ Wasabi: ${error.message}`);
      return NextResponse.json(
        { 
          success: false, 
          error: `Lỗi khi xóa file: ${error.message}`,
          key: key
        }, 
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Lỗi chung khi xử lý yêu cầu xóa file:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || "Có lỗi xảy ra khi xử lý yêu cầu" 
      }, 
      { status: 500 }
    );
  }
} 