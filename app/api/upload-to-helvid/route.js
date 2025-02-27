import { NextResponse } from "next/server";
import { HelvidUploader } from "../helvid-uploader/route";
import { downloadFile, getFileMetadata } from "@/lib/drive";
import { readTokens } from "@/lib/tokenStorage";
import FormData from "form-data";
import { pipeline } from "stream/promises";
import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";

export const dynamic = "force-dynamic";

const UPLOAD_TIMEOUT = 30 * 60 * 1000; // 30 phút
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 giây

export async function downloadVideo(url) {
  try {
    console.log("Bắt đầu xử lý URL Drive:", url);
    
    // Extract file ID from Google Drive URL
    const fileId = url.match(/[-\w]{25,}/);
    if (!fileId) {
      throw new Error("Invalid Google Drive URL");
    }

    // Đọc tokens từ storage
    const tokens = await readTokens();
    if (!tokens?.access_token) {
      throw new Error("Không có access token. Vui lòng đăng nhập lại.");
    }

    // Lấy thông tin file
    const metadata = await getFileMetadata(fileId[0], tokens);
    console.log("File metadata:", metadata);

    // Tạo temporary file path
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `download-${Date.now()}.mp4`);
    
    console.log("Bắt đầu tải video...");

    // Tải file sử dụng hàm từ drive.js
    const fileStream = await downloadFile(fileId[0], {}, tokens);

    // Pipe stream vào file
    await pipeline(
      fileStream,
      fs.createWriteStream(tempFilePath)
    );

    // Verify file size
    const stats = fs.statSync(tempFilePath);
    if (stats.size === 0) {
      throw new Error("Downloaded file is empty");
    }

    console.log("Đã tải video xong:", tempFilePath);
    console.log("Kích thước file đã tải:", (stats.size / 1024 / 1024).toFixed(2), "MB");
    
    return tempFilePath;
  } catch (error) {
    console.error("Lỗi chi tiết khi tải video:", error);
    throw new Error(`Không thể tải video: ${error.message}`);
  }
}

export async function uploadToHelvid(filePath, retryCount = 0) {
  try {
    console.log(`Bắt đầu upload file lên Helvid (lần thử ${retryCount + 1}):`, filePath);
    
    // Kiểm tra file có tồn tại
    if (!fs.existsSync(filePath)) {
      throw new Error("File không tồn tại");
    }

    const stats = fs.statSync(filePath);
    console.log(`Kích thước file upload: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

    // Tạo form data với stream
    const formData = new FormData();
    formData.append("video", fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      knownLength: stats.size
    });
    formData.append("apikey", "kYVXi1CZkTgJJhHYHs57rawJ4LU0z");
    formData.append("cid", "15");
    formData.append("fid", "22");
    formData.append("mycid", "0");

    const uploadUrl = "https://helvid.com/api/upload";

    // Upload với timeout
    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        "Content-Type": "multipart/form-data",
        "Origin": "https://helvid.com",
        "Referer": "https://helvid.com/",
        "Accept": "application/json"
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: UPLOAD_TIMEOUT,
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        process.stdout.write(`\rUploading: ${percentCompleted}%`);
      }
    });

    console.log("\nUpload response:", response.data);

    if (!response.data || response.data.status !== 'success') {
      throw new Error(`Upload thất bại: ${response.data?.msg || 'Lỗi không xác định'}`);
    }

    return response.data;
  } catch (error) {
    console.error(`Lỗi khi upload lên Helvid (lần ${retryCount + 1}):`, error.message);

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`Thử lại sau ${RETRY_DELAY/1000} giây...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return uploadToHelvid(filePath, retryCount + 1);
    }

    throw new Error(`Không thể upload lên Helvid sau ${MAX_RETRIES} lần thử: ${error.message}`);
  } finally {
    // Chỉ xóa file khi đã upload xong hoặc đã hết số lần thử
    if (retryCount >= MAX_RETRIES) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log("Đã xóa file tạm:", filePath);
        }
      } catch (error) {
        console.error("Lỗi khi xóa file tạm:", error);
      }
    }
  }
}

export async function POST(request) {
  try {
    console.log("\n=== Bắt đầu xử lý upload video ===");
    const { videoUrl } = await request.json();

    if (!videoUrl) {
      return NextResponse.json(
        { error: "URL video không được để trống" },
        { status: 400 }
      );
    }

    console.log("Video URL:", videoUrl);

    // Tải video về máy chủ
    const downloadedFilePath = await downloadVideo(videoUrl);

    // Upload lên Helvid
    const uploadResult = await uploadToHelvid(downloadedFilePath);

    // Sửa điều kiện kiểm tra theo status
    if (!uploadResult || uploadResult.status !== 'success') {
      throw new Error("Upload thất bại: " + (uploadResult?.msg || "Lỗi không xác định"));
    }

    const result = {
      success: true,
      data: {
        url: `https://helvid.net/play/index/${uploadResult.vid}`,
        debug: {
          did: uploadResult.did,
          vid: uploadResult.vid,
          message: uploadResult.msg
        }
      }
    };

    console.log("Upload thành công:", result);
    console.log("=== Kết thúc xử lý upload video ===\n");

    return NextResponse.json(result);
  } catch (error) {
    console.error("Lỗi trong quá trình xử lý:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi xử lý video",
      },
      { status: 500 }
    );
  }
} 