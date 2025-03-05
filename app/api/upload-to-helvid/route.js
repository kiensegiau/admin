import { NextResponse } from "next/server";
import { HelvidUploader } from "../helvid-uploader/route";
import { downloadWithTokenRefresh, getFileMetadata } from "@/lib/drive";
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

    console.log("Bắt đầu tải video với IDM và tự động làm mới token...");

    // Tải file sử dụng hàm mới từ drive.js với cơ chế làm mới token tự động
    const fileStream = await downloadWithTokenRefresh(fileId[0], {}, tokens);

    // Pipe stream vào file
    await pipeline(fileStream, fs.createWriteStream(tempFilePath));

    // Verify file size
    const stats = fs.statSync(tempFilePath);
    if (stats.size === 0) {
      throw new Error("Downloaded file is empty");
    }

    console.log("Đã tải video xong:", tempFilePath);
    console.log(
      "Kích thước file đã tải:",
      (stats.size / 1024 / 1024).toFixed(2),
      "MB"
    );

    return tempFilePath;
  } catch (error) {
    console.error("Lỗi chi tiết khi tải video:", error);
    throw new Error(`Không thể tải video: ${error.message}`);
  }
}

export async function uploadToHelvid(filePath, retryCount = 0) {
  try {
    console.log(
      `Bắt đầu upload file lên Helvid (lần thử ${retryCount + 1}):`,
      filePath
    );

    // Kiểm tra file có tồn tại
    if (!fs.existsSync(filePath)) {
      throw new Error("File không tồn tại");
    }

    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`Kích thước file upload: ${fileSizeMB} MB`);

    // Kiểm tra kích thước file
    if (stats.size > 500 * 1024 * 1024) {
      // Giới hạn 500MB
      throw new Error(
        `File quá lớn (${fileSizeMB} MB). Helvid có thể giới hạn kích thước upload.`
      );
    }

    // Tạo form data với stream
    const formData = new FormData();
    formData.append("video", fs.createReadStream(filePath), {
      filename: path.basename(filePath),
      knownLength: stats.size,
    });
    formData.append("apikey", "F3ziE0vwcNP2W57i6j1bdk4QjbwNX"); // Sử dụng API key mới
    formData.append("cid", "15");
    formData.append("fid", "18"); // Sử dụng fid=18 như trong ví dụ
    formData.append("mycid", "17"); // Sử dụng mycid=17 như trong ví dụ

    const uploadUrl = "https://helvid.com/api/upload";

    // Upload với timeout và cấu hình tốt hơn
    const response = await axios.post(uploadUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        "Content-Type": "multipart/form-data",
        Origin: "https://helvid.com",
        Referer: "https://helvid.com/",
        Accept: "application/json",
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: UPLOAD_TIMEOUT,
      decompress: true, // Cho phép giải nén response
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        process.stdout.write(`\rUploading: ${percentCompleted}%`);
      },
    });

    console.log("\nUpload response:", response.data);

    if (!response.data || response.data.status !== "success") {
      throw new Error(
        `Upload thất bại: ${response.data?.msg || "Lỗi không xác định"}`
      );
    }

    return response.data;
  } catch (error) {
    console.error(
      `Lỗi khi upload lên Helvid (lần ${retryCount + 1}):`,
      error.message
    );

    // Kiểm tra lỗi 413
    if (error.response && error.response.status === 413) {
      console.error(
        "Lỗi 413: Request Entity Too Large - File quá lớn cho server"
      );
      throw new Error(
        "Lỗi 413: File quá lớn cho server Helvid. Vui lòng thử file nhỏ hơn hoặc sử dụng phương thức upload khác."
      );
    }

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`Thử lại sau ${RETRY_DELAY / 1000} giây...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return uploadToHelvid(filePath, retryCount + 1);
    }

    throw new Error(
      `Không thể upload lên Helvid sau ${MAX_RETRIES} lần thử: ${error.message}`
    );
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

// Thêm phương thức upload thay thế sử dụng HelvidUploader
export async function uploadToHelvidAlternative(driveUrl, retryCount = 0) {
  try {
    console.log(
      `Bắt đầu upload file lên Helvid qua phương thức thay thế (lần thử ${
        retryCount + 1
      }):`,
      driveUrl
    );

    const uploader = new HelvidUploader();
    const result = await uploader.uploadFromDrive(driveUrl);

    if (!result.success) {
      throw new Error(
        `Upload thất bại: ${result.error || "Lỗi không xác định"}`
      );
    }

    // Chuyển đổi kết quả để phù hợp với định dạng trả về của uploadToHelvid
    return {
      status: "success",
      msg: "Video upload complete",
      did: result.data.debug.originalDid,
      vid: result.data.debug.videoDetails.vid,
    };
  } catch (error) {
    console.error(
      `Lỗi khi upload lên Helvid qua phương thức thay thế (lần ${
        retryCount + 1
      }):`,
      error.message
    );

    // Retry logic
    if (retryCount < MAX_RETRIES) {
      console.log(`Thử lại sau ${RETRY_DELAY / 1000} giây...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return uploadToHelvidAlternative(driveUrl, retryCount + 1);
    }

    throw new Error(
      `Không thể upload lên Helvid sau ${MAX_RETRIES} lần thử: ${error.message}`
    );
  }
}

export async function POST(request) {
  try {
    console.log("\n=== Bắt đầu xử lý upload video ===");
    const { videoUrl, useAlternativeMethod } = await request.json();

    if (!videoUrl) {
      return NextResponse.json(
        { error: "URL video không được để trống" },
        { status: 400 }
      );
    }

    console.log("Video URL:", videoUrl);

    let result;

    // Sử dụng HelvidUploader trực tiếp
    if (useAlternativeMethod) {
      console.log("Sử dụng phương thức upload bằng URL...");
      const uploader = new HelvidUploader();
      result = await uploader.uploadFromDrive(videoUrl);

      if (!result.success) {
        throw new Error(
          "Upload thất bại: " + (result.error || "Lỗi không xác định")
        );
      }

      return NextResponse.json(result);
    } else {
      // Phương thức thông thường: tải về máy chủ rồi upload
      console.log("Sử dụng phương thức upload thông thường...");
      const downloadedFilePath = await downloadVideo(videoUrl);
      const uploadResult = await uploadToHelvid(downloadedFilePath);

      if (!uploadResult || uploadResult.status !== "success") {
        throw new Error(
          "Upload thất bại: " + (uploadResult?.msg || "Lỗi không xác định")
        );
      }

      result = {
        success: true,
        data: {
          videoUrl: `https://helvid.net/play/index/${uploadResult.vid}`,
          debug: {
            did: uploadResult.did,
            vid: uploadResult.vid,
            message: uploadResult.msg,
          },
        },
      };

      console.log("Upload thành công:", result);
      console.log("=== Kết thúc xử lý upload video ===\n");

      return NextResponse.json(result);
    }
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
