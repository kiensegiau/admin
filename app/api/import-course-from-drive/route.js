export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { readTokens } from "@/lib/tokenStorage";
import { encryptId } from "@/lib/encryption";
import {
  initializeDriveClient,
  getFolderInfo,
  listFolderContents,
} from "@/app/utils/serverDriveUtils";
import path from "path";
import os from "os";
import fs from "fs";
import axios from "axios";
import { pipeline } from "stream/promises";
// Import AWS SDK S3
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { refreshDriveToken, checkAndRefreshToken } from "@/lib/tokenRefresher";

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

// Thêm cache để lưu trữ dữ liệu đã truy vấn
const cache = {
  courseData: {},
  fileChecks: {},
};

// Thêm cấu trúc dữ liệu để theo dõi các mục đã xử lý
const syncState = {
  processedItems: {
    chapters: new Set(),
    lessons: new Set(),
    files: new Set(),
    subfolders: new Set(),
  },
  needSync: false,
};

// Hàm lấy ID từ Google Drive URL
function extractDriveId(url) {
  const patterns = [
    /\/folders\/([a-zA-Z0-9-_]+)/, // Format: folders/id
    /\/d\/([a-zA-Z0-9-_]+)/, // Format: d/id
    /id=([a-zA-Z0-9-_]+)/, // Format: id=id
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Hàm xử lý đường dẫn an toàn cho Wasabi
function sanitizeWasabiPath(path) {
  if (!path) return "";

  // Xử lý từng phần của đường dẫn
  const parts = path.split("/").map((part) => {
    if (!part) return "";

    // Thay vì loại bỏ dấu, chuyển toàn bộ ký tự không an toàn
    // thành mã hex để giữ lại nguyên nghĩa
    let sanitized = part;

    // Thay thế các ký tự không hợp lệ trên Wasabi
    sanitized = sanitized
      .replace(/[<>:"\/\\|?*\x00-\x1F]/g, "-") // Ký tự không hợp lệ trên hầu hết các hệ thống
      .replace(/\s+/g, "-") // Thay khoảng trắng bằng gạch ngang
      .replace(/-+/g, "-") // Loại bỏ nhiều gạch ngang liên tiếp
      .replace(/^-+|-+$/g, ""); // Loại bỏ gạch ngang ở đầu và cuối

    // Đảm bảo chiều dài an toàn cho mỗi phần của đường dẫn
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }

    return sanitized;
  });

  // Loại bỏ các phần rỗng và giới hạn tổng chiều dài đường dẫn
  const result = parts.filter(Boolean).join("/");

  // Nếu đường dẫn quá dài, cắt bớt để đảm bảo an toàn
  if (result.length > 900) {
    // AWS S3 có giới hạn key 1024 ký tự
    console.warn(`Đường dẫn quá dài, đã cắt bớt: ${result.length} ký tự`);
    return result.substring(0, 900);
  }

  return result;
}

// Hàm upload file từ Google Drive lên Wasabi
async function uploadToWasabi(
  drive,
  fileId,
  fileName,
  mimeType,
  folderPath = "",
  retryCount = 0
) {
  const MAX_RETRIES = 3;
  let tempDir;
  let tempFilePath;

  try {
    tempDir = path.join(os.tmpdir(), "hocmai-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Chỉ làm sạch tên file để lưu vào bộ nhớ tạm, tránh lỗi hệ thống tệp
    const sanitizedFileName = sanitizeFileName(fileName);
    tempFilePath = path.join(tempDir, sanitizedFileName);

    console.log(`Đang tải file ${fileName} từ Google Drive...`);

    // Biến theo dõi tốc độ tải
    const downloadStartTime = Date.now();
    let lastProgressTime = Date.now();
    let downloadedBytes = 0;
    let totalBytes = 0;

    // Sử dụng retryWithNewToken để đảm bảo token không hết hạn khi tải file lớn
    const fileStream = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      { responseType: "stream" }
    );

    // Lấy thông tin file để biết kích thước
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: "size,name",
    });

    totalBytes = parseInt(fileInfo.data.size, 10) || 0;
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    // Đối với file lớn, sử dụng stream để download
    const writer = fs.createWriteStream(tempFilePath);

    // Theo dõi tiến trình tải
    fileStream.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;

      // Hiển thị tiến trình mỗi 1 giây hoặc khi tải xong
      const now = Date.now();
      if (now - lastProgressTime > 1000 || downloadedBytes >= totalBytes) {
        const percent = totalBytes
          ? Math.round((downloadedBytes / totalBytes) * 100)
          : 0;
        const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(2);
        const elapsedSecs = ((now - downloadStartTime) / 1000).toFixed(1);
        const currentSpeed = (downloadedMB / elapsedSecs).toFixed(2);

        console.log(
          `Tải xuống: ${percent}% (${downloadedMB}/${totalMB} MB) - Tốc độ hiện tại: ${currentSpeed} MB/s`
        );
        lastProgressTime = now;
      }
    });

    // Thêm xử lý lỗi cho stream
    fileStream.data.on("error", (err) => {
      writer.end();
      throw new Error(`Lỗi khi tải file: ${err.message}`);
    });

    try {
      await pipeline(fileStream.data, writer);
    } catch (err) {
      console.error(`Lỗi khi tải file về: ${err.message}`);
      // Nếu lỗi khi download, thử lại
      if (retryCount < MAX_RETRIES) {
        console.log(`Thử lại lần ${retryCount + 1}/${MAX_RETRIES}...`);
        // Đảm bảo đóng writer trước khi thử lại
        writer.end();
        // Thử lại toàn bộ quá trình
        return uploadToWasabi(
          drive,
          fileId,
          fileName,
          mimeType,
          folderPath,
          retryCount + 1
        );
      }
      throw err;
    }

    // Kiểm tra file tồn tại sau khi tải
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`File tạm không tồn tại sau khi tải: ${tempFilePath}`);
    }

    const downloadEndTime = Date.now();
    const downloadDuration = (downloadEndTime - downloadStartTime) / 1000; // chuyển sang giây

    // Đọc kích thước file
    const stats = fs.statSync(tempFilePath);
    const fileSizeInBytes = stats.size;
    const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

    // Tính tốc độ tải (MB/s)
    const downloadSpeed =
      downloadDuration > 0 ? (fileSizeInMB / downloadDuration).toFixed(2) : 0;

    console.log(`File đã được tải về: ${tempFilePath}`);
    console.log(
      `Kích thước: ${fileSizeInMB.toFixed(
        2
      )} MB | Thời gian tải: ${downloadDuration.toFixed(
        2
      )}s | Tốc độ: ${downloadSpeed} MB/s`
    );

    // Đọc file để upload lên Wasabi
    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(tempFilePath);
    } catch (readErr) {
      console.error(`Lỗi khi đọc file tạm: ${readErr.message}`);
      if (retryCount < MAX_RETRIES) {
        console.log(`Thử lại lần ${retryCount + 1}/${MAX_RETRIES}...`);
        return uploadToWasabi(
          drive,
          fileId,
          fileName,
          mimeType,
          folderPath,
          retryCount + 1
        );
      }
      throw readErr;
    }

    // Tạo key cho file trên Wasabi dựa vào cấu trúc thư mục từ Google Drive
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8); // Lấy 8 ký tự đầu của UUID

    // Tạo key với tên file đã được xử lý
    let key;

    // Xử lý đường dẫn thư mục nếu có, giữ cấu trúc nhưng xử lý các ký tự đặc biệt
    if (folderPath && folderPath !== "") {
      // Xử lý đường dẫn an toàn
      const sanitizedPath = sanitizeWasabiPath(folderPath);
      // Tạo key cho file
      key = `courses/${sanitizedPath}/${timestamp}-${uniqueId}-${sanitizeFileName(
        fileName
      )}`;
    } else {
      key = `courses/${timestamp}-${uniqueId}-${sanitizeFileName(fileName)}`;
    }

    console.log(`Tạo key Wasabi: ${key}`);

    // Biến theo dõi tốc độ upload
    const uploadStartTime = Date.now();
    console.log(`Bắt đầu upload lên Wasabi (${fileSizeInMB.toFixed(2)} MB)...`);

    // Upload lên Wasabi
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    try {
      await s3Client.send(command);

      // Xác minh file đã được tải lên thành công
      try {
        const checkCommand = new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        const headResponse = await s3Client.send(checkCommand);
        console.log(
          `Xác minh upload thành công: ${key} (${headResponse.ContentLength} bytes)`
        );
      } catch (verifyErr) {
        console.warn(
          `Không thể xác minh file sau khi upload: ${key}`,
          verifyErr.name
        );
        // Tiếp tục xử lý vì chúng ta đã tải lên, có thể là vấn đề trễ hoặc nhất quán
      }
    } catch (uploadErr) {
      console.error(`Lỗi khi upload lên Wasabi: ${uploadErr.message}`);
      if (retryCount < MAX_RETRIES) {
        console.log(`Thử lại lần ${retryCount + 1}/${MAX_RETRIES}...`);
        return uploadToWasabi(
          drive,
          fileId,
          fileName,
          mimeType,
          folderPath,
          retryCount + 1
        );
      }
      throw uploadErr;
    }

    const uploadEndTime = Date.now();
    const uploadDuration = (uploadEndTime - uploadStartTime) / 1000; // chuyển sang giây

    // Tính tốc độ upload (MB/s)
    const uploadSpeed =
      uploadDuration > 0 ? (fileSizeInMB / uploadDuration).toFixed(2) : 0;

    console.log(`File đã được upload lên Wasabi: ${key}`);
    console.log(
      `Thời gian upload: ${uploadDuration.toFixed(
        2
      )}s | Tốc độ: ${uploadSpeed} MB/s`
    );

    // Xóa file tạm
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (unlinkErr) {
      console.warn(`Không thể xóa file tạm: ${unlinkErr.message}`);
      // Tiếp tục xử lý, không cần retry vì đã upload thành công
    }

    // Trả về key để lưu trong database và thông tin tốc độ
    return {
      success: true,
      key: key,
      size: fileBuffer.length,
      downloadSpeed: downloadSpeed,
      uploadSpeed: uploadSpeed,
      fileSize: fileSizeInMB.toFixed(2),
    };
  } catch (error) {
    console.error("Lỗi khi upload file lên Wasabi:", error);

    // Cố gắng xóa file tạm nếu tồn tại
    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (unlinkErr) {
      console.warn(`Không thể xóa file tạm sau lỗi: ${unlinkErr.message}`);
    }

    // Nếu lỗi ENOENT hoặc lỗi khác liên quan đến file system và chưa vượt quá số lần thử lại
    if (
      (error.code === "ENOENT" || error.message.includes("no such file")) &&
      retryCount < MAX_RETRIES
    ) {
      console.log(
        `Lỗi file không tìm thấy, thử lại lần ${
          retryCount + 1
        }/${MAX_RETRIES}...`
      );

      // Tạm dừng để hệ thống có thể giải phóng tài nguyên
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Thử lại từ đầu
      return uploadToWasabi(
        drive,
        fileId,
        fileName,
        mimeType,
        folderPath,
        retryCount + 1
      );
    }

    return {
      success: false,
      error: error.message,
      retryCount,
    };
  }
}

// Hàm làm sạch tên file chỉ dùng cho file tạm
function sanitizeFileName(fileName) {
  if (!fileName) return "unknown-file";

  // Danh sách các ký tự không hợp lệ trong tên file
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;

  // Thay thế các ký tự không hợp lệ bằng dấu gạch ngang
  let sanitized = fileName.replace(invalidChars, "-");

  // Xử lý khoảng trắng
  sanitized = sanitized.replace(/\s+/g, "-");

  // Loại bỏ nhiều dấu gạch ngang liên tiếp
  sanitized = sanitized.replace(/-+/g, "-");

  // Loại bỏ dấu gạch ngang ở đầu và cuối
  sanitized = sanitized.replace(/^-+|-+$/g, "");

  // Đảm bảo tên file không vượt quá 255 ký tự
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    sanitized = sanitized.substring(0, 255 - ext.length) + ext;
  }

  // Đảm bảo tên file không rỗng
  if (!sanitized) {
    sanitized = "file-" + Date.now();
  }

  return sanitized;
}

// Thêm hàm kiểm tra và trả về khóa học nếu đã tồn tại hoặc tạo mới nếu chưa có
async function getOrCreateCourse(name, driveUrl = null, driveFolderId = null) {
  try {
    if (!name || typeof name !== "string") {
      throw new Error("Tên khóa học không hợp lệ");
    }

    // Kiểm tra xem khóa học đã tồn tại chưa
    console.log(`Kiểm tra khóa học có tên "${name}" đã tồn tại chưa`);
    const coursesRef = db.collection("courses");
    const snapshot = await coursesRef.where("title", "==", name).get();

    if (!snapshot.empty) {
      // Khóa học đã tồn tại, trả về khóa học đầu tiên tìm thấy
      const courseDoc = snapshot.docs[0];
      const courseData = courseDoc.data();
      console.log(`Đã tìm thấy khóa học: ${courseDoc.id}`);

      // Cập nhật driveUrl nếu chưa có và có giá trị mới
      if (driveUrl && !courseData.driveUrl) {
        await courseDoc.ref.update({
          driveUrl: driveUrl,
          driveFolderId: driveFolderId,
          updatedAt: new Date().toISOString(),
        });
        console.log(`Đã cập nhật Drive URL cho khóa học hiện có: ${driveUrl}`);
        courseData.driveUrl = driveUrl;
        courseData.driveFolderId = driveFolderId;
      }

      return { id: courseDoc.id, ...courseData, isExisting: true };
    }

    // Khóa học chưa tồn tại, tạo mới
    const courseData = {
      title: name,
      chapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      teacher: "",
      subject: "",
      grade: "",
      price: 0,
      description: "",
      status: "draft",
      totalLessons: 0,
      totalChapters: 0,
    };

    // Thêm driveUrl và driveFolderId nếu có
    if (driveUrl) {
      courseData.driveUrl = driveUrl;
      courseData.driveFolderId = driveFolderId;
    }

    const courseRef = await db.collection("courses").add(courseData);
    console.log("Đã tạo khóa học mới:", courseRef.id);
    return { id: courseRef.id, ...courseData, isExisting: false };
  } catch (error) {
    console.error("Lỗi khi kiểm tra/tạo khóa học:", error);
    throw new Error("Không thể kiểm tra/tạo khóa học: " + error.message);
  }
}

// Thêm hàm kiểm tra và trả về chương nếu đã tồn tại hoặc tạo mới nếu chưa có
async function getOrCreateChapter(courseId, name) {
  try {
    if (!courseId || !name) {
      throw new Error("CourseId và tên chapter không được để trống");
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      throw new Error("Không tìm thấy khóa học");
    }

    const courseData = courseDoc.data();

    // Kiểm tra xem chương đã tồn tại chưa
    console.log(`Kiểm tra chương có tên "${name}" trong khóa học ${courseId}`);
    const existingChapter = courseData.chapters.find(
      (chapter) => chapter.title === name
    );

    if (existingChapter) {
      // Chương đã tồn tại, trả về
      console.log(`Đã tìm thấy chương: ${existingChapter.id}`);
      return { ...existingChapter, isExisting: true };
    }

    // Chương chưa tồn tại, tạo mới
    const chapterId = uuidv4();
    const newChapter = {
      id: chapterId,
      title: name,
      lessons: [],
      order: (courseData.chapters?.length || 0) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalLessons: 0,
    };

    await courseRef.update({
      chapters: [...(courseData.chapters || []), newChapter],
      updatedAt: new Date().toISOString(),
      totalChapters: (courseData.chapters?.length || 0) + 1,
    });

    console.log(
      `Đã tạo chương mới: ${name} (ID: ${chapterId}) cho khóa học: ${courseId}`
    );
    return { ...newChapter, isExisting: false };
  } catch (error) {
    console.error("Lỗi khi kiểm tra/tạo chương:", error);
    throw new Error("Không thể kiểm tra/tạo chương: " + error.message);
  }
}

// Thêm hàm kiểm tra và trả về bài học nếu đã tồn tại hoặc tạo mới nếu chưa có
async function getOrCreateLesson(courseId, chapterId, name) {
  try {
    if (!courseId || !chapterId || !name) {
      throw new Error("CourseId, ChapterId và tên lesson không được để trống");
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      throw new Error("Không tìm thấy khóa học");
    }

    const courseData = courseDoc.data();
    const chapter = courseData.chapters.find((c) => c.id === chapterId);

    if (!chapter) {
      throw new Error("Không tìm thấy chapter");
    }

    // Kiểm tra xem bài học đã tồn tại chưa
    console.log(`Kiểm tra bài học có tên "${name}" trong chương ${chapterId}`);
    const existingLesson = chapter.lessons.find(
      (lesson) => lesson.title === name
    );

    if (existingLesson) {
      // Bài học đã tồn tại, trả về
      console.log(`Đã tìm thấy bài học: ${existingLesson.id}`);
      return { lessonId: existingLesson.id, chapterId, isExisting: true };
    }

    // Bài học chưa tồn tại, tạo mới
    const lessonId = uuidv4();
    const newLesson = {
      id: lessonId,
      title: name,
      files: [],
      subfolders: [],
      order: (chapter.lessons?.length || 0) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedChapters = courseData.chapters.map((chapter) => {
      if (chapter.id === chapterId) {
        return {
          ...chapter,
          lessons: [...(chapter.lessons || []), newLesson],
          totalLessons: (chapter.lessons?.length || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      }
      return chapter;
    });

    await courseRef.update({
      chapters: updatedChapters,
      updatedAt: new Date().toISOString(),
      totalLessons: courseData.totalLessons + 1,
    });

    console.log(
      `Đã tạo bài học mới: ${name} (ID: ${lessonId}) trong chương: ${chapterId}`
    );
    return { lessonId, chapterId, isExisting: false };
  } catch (error) {
    console.error("Lỗi khi kiểm tra/tạo bài học:", error);
    throw new Error("Không thể kiểm tra/tạo bài học: " + error.message);
  }
}

async function createChapter(courseId, name) {
  try {
    if (!courseId || !name) {
      throw new Error("CourseId và tên chapter không được để trống");
    }

    const chapterId = uuidv4();
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      throw new Error("Không tìm thấy khóa học");
    }

    const courseData = courseDoc.data();
    const newChapter = {
      id: chapterId,
      title: name,
      lessons: [],
      order: (courseData.chapters?.length || 0) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalLessons: 0,
    };

    await courseRef.update({
      chapters: [...(courseData.chapters || []), newChapter],
      updatedAt: new Date().toISOString(),
      totalChapters: (courseData.chapters?.length || 0) + 1,
    });

    console.log(
      `Đã tạo chapter mới: ${name} (ID: ${chapterId}) cho khóa học: ${courseId}`
    );
    return chapterId;
  } catch (error) {
    console.error("Lỗi khi tạo chapter:", error);
    throw new Error("Không thể tạo chapter: " + error.message);
  }
}

async function createLesson(courseId, chapterId, name) {
  try {
    if (!courseId || !chapterId || !name) {
      throw new Error("CourseId, ChapterId và tên lesson không được để trống");
    }

    const lessonId = uuidv4();
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      throw new Error("Không tìm thấy khóa học");
    }

    const courseData = courseDoc.data();
    const chapter = courseData.chapters.find((c) => c.id === chapterId);

    if (!chapter) {
      throw new Error("Không tìm thấy chapter");
    }

    const newLesson = {
      id: lessonId,
      title: name,
      files: [],
      subfolders: [],
      order: (chapter.lessons?.length || 0) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedChapters = courseData.chapters.map((chapter) => {
      if (chapter.id === chapterId) {
        return {
          ...chapter,
          lessons: [...(chapter.lessons || []), newLesson],
          totalLessons: (chapter.lessons?.length || 0) + 1,
          updatedAt: new Date().toISOString(),
        };
      }
      return chapter;
    });

    await courseRef.update({
      chapters: updatedChapters,
      updatedAt: new Date().toISOString(),
      totalLessons: courseData.totalLessons + 1,
    });

    console.log(
      `Đã tạo lesson mới: ${name} (ID: ${lessonId}) trong chapter: ${chapterId}`
    );
    return { lessonId, chapterId };
  } catch (error) {
    console.error("Lỗi khi tạo lesson:", error);
    throw new Error("Không thể tạo lesson: " + error.message);
  }
}

async function getOrCreateSubfolder(courseId, chapterId, lessonId, folderName) {
  try {
    if (!courseId || !chapterId || !lessonId || !folderName) {
      throw new Error("Thiếu thông tin cần thiết để tạo subfolder");
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      throw new Error("Không tìm thấy khóa học");
    }

    const courseData = courseDoc.data();
    const chapter = courseData.chapters.find((c) => c.id === chapterId);

    if (!chapter) {
      throw new Error("Không tìm thấy chapter");
    }

    const lesson = chapter.lessons.find((l) => l.id === lessonId);

    if (!lesson) {
      throw new Error("Không tìm thấy lesson");
    }

    let subfolder = lesson.subfolders?.find((s) => s.name === folderName);

    if (!subfolder) {
      subfolder = {
        id: uuidv4(),
        name: folderName,
        files: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const updatedChapters = courseData.chapters.map((c) => {
        if (c.id === chapterId) {
          const updatedLessons = c.lessons.map((l) => {
            if (l.id === lessonId) {
              return {
                ...l,
                subfolders: [...(l.subfolders || []), subfolder],
                updatedAt: new Date().toISOString(),
              };
            }
            return l;
          });
          return { ...c, lessons: updatedLessons };
        }
        return c;
      });

      await courseRef.update({
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      console.log(
        `Đã tạo subfolder mới: ${folderName} trong lesson: ${lessonId}`
      );
    }

    return subfolder.id;
  } catch (error) {
    console.error("Lỗi khi tạo/lấy subfolder:", error);
    throw error;
  }
}

// Hàm kiểm tra và xóa file trùng lặp trong bài học - cải tiến logic theo yêu cầu
async function checkAndDeleteDuplicateFiles(courseId, chapterId, lessonId, newFileName, subfolderId = null) {
  try {
    console.log(`Kiểm tra trùng lặp cho file "${newFileName}" trong bài học ${lessonId}`);
    
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();
    
    if (!courseDoc.exists) {
      console.warn(`Không tìm thấy khóa học ${courseId} khi kiểm tra trùng lặp`);
      return { needUpload: true, fileData: null };
    }
    
    const courseData = courseDoc.data();
    const chapter = courseData.chapters.find(c => c.id === chapterId);
    
    if (!chapter) {
      console.warn(`Không tìm thấy chương ${chapterId} khi kiểm tra trùng lặp`);
      return { needUpload: true, fileData: null };
    }
    
    const lesson = chapter.lessons.find(l => l.id === lessonId);
    
    if (!lesson) {
      console.warn(`Không tìm thấy bài học ${lessonId} khi kiểm tra trùng lặp`);
      return { needUpload: true, fileData: null };
    }
    
    let duplicateFiles = [];
    let locationInfo = ""; // Thông tin vị trí cho log
    
    if (subfolderId) {
      // Kiểm tra trong thư mục con cụ thể
      const subfolder = lesson.subfolders?.find(sf => sf.id === subfolderId);
      if (!subfolder) {
        console.warn(`Không tìm thấy thư mục con ${subfolderId} khi kiểm tra trùng lặp`);
        return { needUpload: true, fileData: null };
      }
      
      locationInfo = `trong thư mục con "${subfolder.name}"`;
      
      // Tìm tất cả file trùng tên trong subfolder
      duplicateFiles = subfolder.files?.filter(file => 
        file.name === newFileName || file.originalName === newFileName
      ) || [];
    } else {
      // Kiểm tra trong bài học
      locationInfo = `trong bài học "${lesson.title}"`;
      
      duplicateFiles = lesson.files?.filter(file => 
        file.name === newFileName || file.originalName === newFileName
      ) || [];
    }
    
    // Trường hợp 1: Không có file nào -> cần tải mới
    if (duplicateFiles.length === 0) {
      console.log(`Không tìm thấy file trùng lặp cho "${newFileName}" ${locationInfo}, cần tải mới`);
      return { needUpload: true, fileData: null };
    }
    
    // Trường hợp 2: Có 1 file duy nhất -> kiểm tra key Wasabi
    if (duplicateFiles.length === 1) {
      const file = duplicateFiles[0];
      console.log(`Tìm thấy 1 file "${newFileName}" ${locationInfo}, kiểm tra key Wasabi`);
      
      if (file.storage?.provider === "wasabi" && file.storage?.key) {
        // Kiểm tra file có thực sự tồn tại trên Wasabi không
        const wasabiFileExists = await checkWasabiFile(file.storage.key);
        
        if (wasabiFileExists) {
          console.log(`File "${newFileName}" đã có key Wasabi hợp lệ: ${file.storage.key}, không cần tải lại`);
          return { needUpload: false, fileData: file };
        } else {
          console.log(`File "${newFileName}" có key Wasabi nhưng file không tồn tại trên Wasabi, cần tải lại`);
          return { needUpload: true, fileData: file };
        }
      } else {
        console.log(`File "${newFileName}" không có key Wasabi, cần tải lên Wasabi`);
        return { needUpload: true, fileData: file };
      }
    }
    
    // Trường hợp 3: Có nhiều file trùng tên -> xóa bớt, chỉ giữ lại file đầu tiên
    console.log(`Tìm thấy ${duplicateFiles.length} file trùng lặp với tên "${newFileName}" ${locationInfo}, xóa bớt`);
    
    // Giữ lại file đầu tiên
    const keptFile = duplicateFiles[0];
    const filesToDelete = duplicateFiles.slice(1);
    
    // Xóa các file trùng lặp còn lại khỏi Wasabi
    for (const file of filesToDelete) {
      if (file.storage?.provider === "wasabi" && file.storage?.key) {
        await deleteFromWasabi(file.storage.key);
        console.log(`Đã xóa file trùng lặp từ Wasabi: ${file.storage.key}`);
      } else {
        console.log(`File trùng lặp không có lưu trữ trên Wasabi hoặc không có key`);
      }
    }
    
    // Cập nhật database để xóa các file trùng lặp
    if (subfolderId) {
      // Xóa file trùng lặp trong thư mục con
      const updatedChapters = courseData.chapters.map(c => {
        if (c.id === chapterId) {
          const updatedLessons = c.lessons.map(l => {
            if (l.id === lessonId) {
              const updatedSubfolders = l.subfolders.map(sf => {
                if (sf.id === subfolderId) {
                  // Lọc để chỉ giữ lại keptFile và các file khác tên
                  const filteredFiles = sf.files.filter(file => 
                    (file.id === keptFile.id) || 
                    (file.name !== newFileName && file.originalName !== newFileName)
                  );
                  
                  console.log(`Đã xóa ${sf.files.length - filteredFiles.length} file trùng lặp từ subfolder trong database`);
                  
                  return {
                    ...sf,
                    files: filteredFiles,
                    updatedAt: new Date().toISOString()
                  };
                }
                return sf;
              });
              
              return {
                ...l,
                subfolders: updatedSubfolders,
                updatedAt: new Date().toISOString()
              };
            }
            return l;
          });
          
          return { ...c, lessons: updatedLessons };
        }
        return c;
      });
      
      await courseRef.update({
        chapters: updatedChapters,
        updatedAt: new Date().toISOString()
      });
    } else {
      // Xóa file trùng lặp trong bài học
      const updatedChapters = courseData.chapters.map(c => {
        if (c.id === chapterId) {
          const updatedLessons = c.lessons.map(l => {
            if (l.id === lessonId) {
              // Lọc để chỉ giữ lại keptFile và các file khác tên
              const filteredFiles = l.files.filter(file => 
                (file.id === keptFile.id) || 
                (file.name !== newFileName && file.originalName !== newFileName)
              );
              
              console.log(`Đã xóa ${l.files.length - filteredFiles.length} file trùng lặp từ lesson trong database`);
              
              return {
                ...l,
                files: filteredFiles,
                updatedAt: new Date().toISOString()
              };
            }
            return l;
          });
          
          return { ...c, lessons: updatedLessons };
        }
        return c;
      });
      
      await courseRef.update({
        chapters: updatedChapters,
        updatedAt: new Date().toISOString()
      });
    }
    
    console.log(`Đã hoàn thành xử lý file trùng lặp cho "${newFileName}", còn lại 1 file duy nhất`);
    
    // Kiểm tra file còn lại có key Wasabi hợp lệ không
    if (keptFile.storage?.provider === "wasabi" && keptFile.storage?.key) {
      // Kiểm tra file có thực sự tồn tại trên Wasabi không
      const wasabiFileExists = await checkWasabiFile(keptFile.storage.key);
      
      if (wasabiFileExists) {
        console.log(`File còn lại "${newFileName}" đã có key Wasabi hợp lệ: ${keptFile.storage.key}, không cần tải lại`);
        return { needUpload: false, fileData: keptFile };
      } else {
        console.log(`File còn lại "${newFileName}" có key Wasabi nhưng file không tồn tại trên Wasabi, cần tải lại`);
        return { needUpload: true, fileData: keptFile };
      }
    } else {
      console.log(`File còn lại "${newFileName}" không có key Wasabi, cần tải lên Wasabi`);
      return { needUpload: true, fileData: keptFile };
    }
  } catch (error) {
    console.error(`Lỗi khi xử lý file trùng lặp: ${error.message}`, error);
    return { needUpload: true, fileData: null };
  }
}

// Cập nhật hàm processFiles để sử dụng logic mới
async function processFiles(
  drive,
  validFiles,
  courseId,
  parentId,
  lessonId,
  parentType,
  parentPath
) {
  console.log(
    `\n=== Bắt đầu xử lý ${validFiles.length} files lên Wasabi từ ${
      parentPath || "thư mục gốc"
    } ===`
  );
  console.log(`Đường dẫn gốc: "${parentPath}"`);
  console.log(`Đường dẫn sau khi xử lý: "${sanitizeWasabiPath(parentPath)}"`);

  // Kiểm tra toàn bộ files trước để xác định những file cần xử lý
  const filesToProcess = [];
  for (const file of validFiles) {
    // Đánh dấu file đã xử lý (để không bị xóa khi đồng bộ)
    syncState.processedItems.files.add(file.id);

    // Lấy tên subfolder từ parentPath nếu là kiểu subfolder
    const subfolderName =
      parentType === "subfolder" && parentPath
        ? parentPath.split("/").pop()
        : null;

    // Tìm subfolderId nếu có
    let subfolderId = null;
    if (subfolderName && parentType === "subfolder") {
      const courseRef = db.collection("courses").doc(courseId);
      const courseDoc = await courseRef.get();
      
      if (courseDoc.exists) {
        const courseData = courseDoc.data();
        const chapter = courseData.chapters.find(c => c.id === parentId);
        
        if (chapter) {
          const lesson = chapter.lessons.find(l => l.id === lessonId);
          
          if (lesson) {
            const subfolder = lesson.subfolders?.find(sf => sf.name === subfolderName);
            if (subfolder) {
              subfolderId = subfolder.id;
            }
          }
        }
      }
    }

    // Kiểm tra trùng lặp và xác định xem có cần tải lên không
    const { needUpload, fileData } = await checkAndDeleteDuplicateFiles(
      courseId, 
      parentId, 
      lessonId, 
      file.name,
      subfolderId
    );

    if (needUpload) {
      filesToProcess.push({
        ...file,
        folderPath: parentPath, // Thêm đường dẫn thư mục cho file
        existingData: fileData // Có thể là null hoặc file đang tồn tại cần cập nhật
      });
    } else {
      console.log(`File ${file.name} đã tồn tại và có key Wasabi hợp lệ, bỏ qua.`);
    }
  }

  if (filesToProcess.length === 0) {
    console.log("Không có file mới hoặc file cần tải lại lên Wasabi.");
    return;
  }

  // Biến thống kê tốc độ
  const stats = {
    totalFiles: filesToProcess.length,
    processedFiles: 0,
    totalSize: 0,
    totalDownloadTime: 0,
    totalUploadTime: 0,
    avgDownloadSpeed: 0,
    avgUploadSpeed: 0,
    startTime: Date.now(),
  };

  // Xử lý các file theo batch để không quá tải hệ thống
  const BATCH_SIZE = 5; // Số file xử lý đồng thời

  for (let i = 0; i < filesToProcess.length; i += BATCH_SIZE) {
    const batch = filesToProcess.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (file) => {
        try {
          const isUpdate = !!file.existingData;
          console.log(
            `\nĐang ${isUpdate ? "cập nhật" : "xử lý"} file: ${file.name} (${
              file.mimeType
            })`
          );
          console.log(`Đường dẫn thư mục: ${file.folderPath}`);

          const uploadResult = await uploadToWasabi(
            drive,
            file.id,
            file.name,
            file.mimeType,
            file.folderPath
          );

          if (uploadResult.success) {
            // Cập nhật thống kê
            stats.processedFiles++;
            stats.totalSize += parseFloat(uploadResult.fileSize || 0);
            stats.totalDownloadTime +=
              parseFloat(uploadResult.downloadSpeed) > 0
                ? parseFloat(uploadResult.fileSize) /
                  parseFloat(uploadResult.downloadSpeed)
                : 0;
            stats.totalUploadTime +=
              parseFloat(uploadResult.uploadSpeed) > 0
                ? parseFloat(uploadResult.fileSize) / parseFloat(uploadResult.uploadSpeed)
                : 0;
          }

          if (!uploadResult.success) {
            console.warn(
              `Upload thất bại cho file ${file.name}:`,
              uploadResult.error
            );
            // Kiểm tra xem lỗi có nghiêm trọng không
            if (
              uploadResult.error.includes("không đủ quyền") ||
              uploadResult.error.includes("không tìm thấy file")
            ) {
              console.error(`Bỏ qua file ${file.name} do lỗi nghiêm trọng`);
              return; // Bỏ qua file này, không thêm vào database
            }
          }

          const isSubfolder = parentType === "subfolder";
          let subfolderId = null;

          if (isSubfolder && parentPath) {
            const subfolderName = parentPath.split("/").pop();
            subfolderId = await getOrCreateSubfolder(
              courseId,
              parentId,
              lessonId,
              subfolderName
            );
          }

          // Chỉ thêm vào database nếu upload thành công hoặc lỗi không nghiêm trọng
          if (uploadResult.success) {
            console.log(
              `File ${file.name} upload thành công lên Wasabi, key: ${uploadResult.key}`
            );

            // Nếu đã tồn tại, cập nhật thông tin lưu trữ
            if (isUpdate) {
              // Tìm và cập nhật file trong database
              const courseRef = db.collection("courses").doc(courseId);
              const courseDoc = await courseRef.get();
              const courseData = courseDoc.data();

              const chapter = courseData.chapters.find(
                (c) => c.id === parentId
              );
              if (!chapter) {
                console.error("Không tìm thấy chapter khi cập nhật file");
                return;
              }

              const lesson = chapter.lessons.find((l) => l.id === lessonId);
              if (!lesson) {
                console.error("Không tìm thấy lesson khi cập nhật file");
                return;
              }

              if (subfolderId) {
                // Cập nhật file trong subfolder
                const updatedChapters = courseData.chapters.map((c) => {
                  if (c.id === parentId) {
                    const updatedLessons = c.lessons.map((l) => {
                      if (l.id === lessonId) {
                        const updatedSubfolders = l.subfolders.map((sf) => {
                          if (sf.name === subfolderName) {
                            const updatedFiles = sf.files.map((f) => {
                              if (f.id === file.existingData.id) {
                                return {
                                  ...f,
                                  storage: {
                                    provider: "wasabi",
                                    key: uploadResult.key,
                                    size: uploadResult.size,
                                    uploadTime: new Date().toISOString(),
                                  },
                                  updatedAt: new Date().toISOString(),
                                };
                              }
                              return f;
                            });
                            return { ...sf, files: updatedFiles };
                          }
                          return sf;
                        });
                        return { ...l, subfolders: updatedSubfolders };
                      }
                      return l;
                    });
                    return { ...c, lessons: updatedLessons };
                  }
                  return c;
                });

                await courseRef.update({
                  chapters: updatedChapters,
                  updatedAt: new Date().toISOString(),
                });
                console.log(
                  `Đã cập nhật key Wasabi cho file ${file.name} trong subfolder`
                );
              } else {
                // Cập nhật file trong lesson
                const updatedChapters = courseData.chapters.map((c) => {
                  if (c.id === parentId) {
                    const updatedLessons = c.lessons.map((l) => {
                      if (l.id === lessonId) {
                        const updatedFiles = l.files.map((f) => {
                          if (f.id === file.existingData.id) {
                            return {
                              ...f,
                              storage: {
                                provider: "wasabi",
                                key: uploadResult.key,
                                size: uploadResult.size,
                                uploadTime: new Date().toISOString(),
                              },
                              updatedAt: new Date().toISOString(),
                            };
                          }
                          return f;
                        });
                        return { ...l, files: updatedFiles };
                      }
                      return l;
                    });
                    return { ...c, lessons: updatedLessons };
                  }
                  return c;
                });

                await courseRef.update({
                  chapters: updatedChapters,
                  updatedAt: new Date().toISOString(),
                });
                console.log(
                  `Đã cập nhật key Wasabi cho file ${file.name} trong lesson`
                );
              }
            } else {
              // Thêm file mới với thông tin Wasabi
              const fileWithWasabi = {
                ...file,
                wasabi: {
                  key: uploadResult.key,
                  size: uploadResult.size,
                },
              };

              await addFileToLesson(
                courseId,
                parentId,
                lessonId,
                fileWithWasabi,
                subfolderId
              );
            }
          } else if (!isUpdate) {
            // Chỉ thêm vào database với liên kết trực tiếp từ Drive nếu là file mới và không upload được
            console.log(
              `Thêm file ${file.name} với link Drive (không qua Wasabi)`
            );
            await addFileToLesson(
              courseId,
              parentId,
              lessonId,
              file,
              subfolderId
            );
          }
        } catch (error) {
          console.error(`Lỗi khi xử lý file ${file.name}:`, error);
          // Không tự động thêm vào database khi có lỗi xử lý
          // Việc này giúp tránh dữ liệu không nhất quán
        }
      })
    );

    // Cho phép hệ thống nghỉ ngơi giữa các batch
    if (i + BATCH_SIZE < filesToProcess.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  console.log(`=== Hoàn thành xử lý ${filesToProcess.length} files ===`);

  // Tính và hiển thị thống kê tốc độ
  const totalTime = (Date.now() - stats.startTime) / 1000; // Thời gian tổng cộng (giây)

  if (stats.processedFiles > 0) {
    stats.avgDownloadSpeed =
      stats.totalDownloadTime > 0
        ? (stats.totalSize / stats.totalDownloadTime).toFixed(2)
        : 0;
    stats.avgUploadSpeed =
      stats.totalUploadTime > 0
        ? (stats.totalSize / stats.totalUploadTime).toFixed(2)
        : 0;

    console.log("\n=== THỐNG KÊ TỐC ĐỘ ===");
    console.log(
      `Số lượng file đã xử lý: ${stats.processedFiles}/${stats.totalFiles}`
    );
    console.log(`Tổng kích thước: ${stats.totalSize.toFixed(2)} MB`);
    console.log(`Thời gian xử lý: ${totalTime.toFixed(2)} giây`);
    console.log(`Tốc độ tải trung bình: ${stats.avgDownloadSpeed} MB/s`);
    console.log(`Tốc độ upload trung bình: ${stats.avgUploadSpeed} MB/s`);
    console.log("======================\n");
  }
}

// Sửa lại hàm processFolder để sử dụng cache và xử lý song song
async function processFolder(
  drive,
  folderId,
  courseId,
  parentType = "course",
  parentId = null,
  lessonId = null,
  parentPath = "",
  courseName = null
) {
  try {
    // Lấy tên khóa học nếu chưa có
    if (!courseName) {
      const courseRef = db.collection("courses").doc(courseId);
      const courseDoc = await courseRef.get();
      if (courseDoc.exists) {
        courseName = courseDoc.data().title || "Unknown Course";
      } else {
        courseName = "Unknown Course";
      }
    }

    // Xử lý đường dẫn: nếu là lần gọi đầu tiên, bắt đầu với tên khóa học
    let currentPath = parentPath;
    if (parentType === "course") {
      // Bắt đầu đường dẫn với tên khóa học
      currentPath = courseName;
    } else if (parentPath === "") {
      // Trường hợp đặc biệt khi đường dẫn rỗng nhưng không phải là thư mục gốc
      currentPath = courseName;
    }

    console.log(`\n=== Bắt đầu xử lý thư mục ${currentPath || "gốc"} ===`);
    console.log(`ParentType: ${parentType}, CourseId: ${courseId}`);

    const files = await listFolderContents(drive, folderId);
    const folders = files.filter(
      (f) => f.mimeType === "application/vnd.google-apps.folder"
    );
    const documents = files.filter(
      (f) => f.mimeType !== "application/vnd.google-apps.folder"
    );

    // Xử lý các thư mục con
    for (const folder of folders) {
      const newPath = currentPath
        ? `${currentPath}/${folder.name}`
        : folder.name;
      console.log(`Tạo đường dẫn mới: ${newPath}`);

      // Hiển thị đường dẫn đã xử lý để kiểm tra
      const sanitizedPath = sanitizeWasabiPath(newPath);
      console.log(`Đường dẫn sau khi xử lý: ${sanitizedPath}`);

      if (parentType === "course") {
        // Kiểm tra và tạo/tái sử dụng chương
        const chapter = await getOrCreateChapter(courseId, folder.name);
        syncState.processedItems.chapters.add(chapter.id);
        await processFolder(
          drive,
          folder.id,
          courseId,
          "chapter",
          chapter.id,
          null,
          newPath,
          courseName
        );
      } else if (parentType === "chapter") {
        // Kiểm tra và tạo/tái sử dụng bài học
        const { lessonId: newLessonId } = await getOrCreateLesson(
          courseId,
          parentId,
          folder.name
        );
        syncState.processedItems.lessons.add(newLessonId);
        await processFolder(
          drive,
          folder.id,
          courseId,
          "lesson",
          parentId,
          newLessonId,
          newPath,
          courseName
        );
      } else if (parentType === "lesson" || parentType === "subfolder") {
        // Kiểm tra và tạo/tái sử dụng thư mục con
        const subfolderName = folder.name;
        const subfolderId = await getOrCreateSubfolder(
          courseId,
          parentId,
          lessonId,
          subfolderName
        );
        syncState.processedItems.subfolders.add(subfolderId);

        await processFolder(
          drive,
          folder.id,
          courseId,
          "subfolder",
          parentId,
          lessonId,
          newPath,
          courseName
        );
      }
    }

    // Xử lý các file
    if ((parentType === "lesson" || parentType === "subfolder") && lessonId) {
      const validFiles = documents.filter((file) => {
        const type = getFileType(file.mimeType);
        return type !== "other";
      });

      if (validFiles.length > 0) {
        console.log(
          `Xử lý ${validFiles.length} file trong thư mục "${currentPath}"`
        );
        // Truyền đường dẫn thư mục khi gọi processFiles
        await processFiles(
          drive,
          validFiles,
          courseId,
          parentId,
          lessonId,
          parentType,
          currentPath
        );
      }
    }

    console.log(`=== Kết thúc xử lý thư mục ${currentPath || "gốc"} ===\n`);
  } catch (error) {
    console.error(`Lỗi khi xử lý thư mục ${parentPath || "gốc"}:`, error);
    throw error;
  }
}

// Thêm hàm xóa file từ Wasabi storage
async function deleteFromWasabi(key, retryCount = 0) {
  if (!key) {
    console.warn("Không có key file để xóa từ Wasabi");
    return false;
  }

  const MAX_RETRIES = 2;
  
  try {
    console.log(`Đang xóa file từ Wasabi với key: ${key}`);

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`Đã xóa file từ Wasabi thành công: ${key}`);
    return true;
  } catch (error) {
    console.error(`Lỗi khi xóa file từ Wasabi (${key}):`, error);
    
    // Thử lại nếu chưa vượt quá số lần thử
    if (retryCount < MAX_RETRIES) {
      console.log(`Thử xóa lại lần ${retryCount + 1}/${MAX_RETRIES}...`);
      // Đợi 500ms trước khi thử lại
      await new Promise(resolve => setTimeout(resolve, 500));
      return deleteFromWasabi(key, retryCount + 1);
    }
    
    // Nếu đã vượt quá số lần thử, kiểm tra xem file có tồn tại không
    try {
      const checkCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      
      try {
        await s3Client.send(checkCommand);
        console.warn(`File vẫn tồn tại trên Wasabi sau ${MAX_RETRIES + 1} lần thử xóa: ${key}`);
        // File vẫn tồn tại
        return false;
      } catch (err) {
        // Nếu lỗi NotFound thì có nghĩa là file đã bị xóa hoặc không tồn tại
        if (err.name === 'NotFound' || err.Code === 'NotFound' || err.name === 'NoSuchKey') {
          console.log(`File không còn tồn tại trên Wasabi: ${key} (có thể đã bị xóa trước đó)`);
          return true;
        }
        console.warn(`Không thể kiểm tra tồn tại của file: ${key} - ${err.message}`);
        return false;
      }
    } catch (checkError) {
      console.error(`Lỗi khi kiểm tra file sau khi xóa thất bại: ${checkError.message}`);
      return false;
    }
  }
}

// Cập nhật hàm synchronizeDeletedItems để xóa triệt để các mục đã xóa
async function synchronizeDeletedItems(courseId) {
  try {
    console.log("\n=== Bắt đầu đồng bộ các mục đã xóa ===");

    // Lấy dữ liệu khóa học hiện tại
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();
    if (!courseDoc.exists) {
      console.log("Không tìm thấy khóa học, bỏ qua đồng bộ xóa");
      return false;
    }

    const courseData = courseDoc.data();
    let hasChanges = false;
    let deletedFilesCount = 0;
    let failedDeletionsCount = 0;

    // Đồng bộ xóa chương và bài học
    const updatedChapters = [];

    for (const chapter of courseData.chapters || []) {
      // Kiểm tra xem chương có tồn tại trên Drive không
      if (!syncState.processedItems.chapters.has(chapter.id)) {
        console.log(
          `Chương "${chapter.title}" (${chapter.id}) đã bị xóa trên Drive, xóa khỏi hệ thống`
        );

        // Xóa tất cả các file trong chương khỏi Wasabi
        for (const lesson of chapter.lessons || []) {
          // Xóa file trong lesson
          for (const file of lesson.files || []) {
            if (file.storage?.provider === "wasabi" && file.storage?.key) {
              try {
                const deleted = await deleteFromWasabi(file.storage.key);
                if (deleted) {
                  deletedFilesCount++;
                } else {
                  failedDeletionsCount++;
                  console.warn(`Không thể xóa file: ${file.storage.key} từ Wasabi`);
                }
              } catch (err) {
                failedDeletionsCount++;
                console.error(`Lỗi khi xóa file từ Wasabi: ${err.message}`);
              }
            }
          }

          // Xóa file trong subfolder
          for (const subfolder of lesson.subfolders || []) {
            for (const file of subfolder.files || []) {
              if (file.storage?.provider === "wasabi" && file.storage?.key) {
                try {
                  const deleted = await deleteFromWasabi(file.storage.key);
                  if (deleted) {
                    deletedFilesCount++;
                  } else {
                    failedDeletionsCount++;
                    console.warn(`Không thể xóa file: ${file.storage.key} từ Wasabi`);
                  }
                } catch (err) {
                  failedDeletionsCount++;
                  console.error(`Lỗi khi xóa file từ Wasabi: ${err.message}`);
                }
              }
            }
          }
        }

        hasChanges = true;
        continue; // Bỏ qua chương đã bị xóa
      }

      // Đồng bộ xóa bài học
      const updatedLessons = [];

      for (const lesson of chapter.lessons || []) {
        if (!syncState.processedItems.lessons.has(lesson.id)) {
          console.log(
            `Bài học "${lesson.title}" (${lesson.id}) đã bị xóa trên Drive, xóa khỏi hệ thống`
          );

          // Xóa tất cả file trong lesson khỏi Wasabi
          for (const file of lesson.files || []) {
            if (file.storage?.provider === "wasabi" && file.storage?.key) {
              try {
                const deleted = await deleteFromWasabi(file.storage.key);
                if (deleted) {
                  deletedFilesCount++;
                } else {
                  failedDeletionsCount++;
                  console.warn(`Không thể xóa file: ${file.storage.key} từ Wasabi`);
                }
              } catch (err) {
                failedDeletionsCount++;
                console.error(`Lỗi khi xóa file từ Wasabi: ${err.message}`);
              }
            }
          }

          // Xóa file trong subfolder
          for (const subfolder of lesson.subfolders || []) {
            for (const file of subfolder.files || []) {
              if (file.storage?.provider === "wasabi" && file.storage?.key) {
                try {
                  const deleted = await deleteFromWasabi(file.storage.key);
                  if (deleted) {
                    deletedFilesCount++;
                  } else {
                    failedDeletionsCount++;
                    console.warn(`Không thể xóa file: ${file.storage.key} từ Wasabi`);
                  }
                } catch (err) {
                  failedDeletionsCount++;
                  console.error(`Lỗi khi xóa file từ Wasabi: ${err.message}`);
                }
              }
            }
          }

          hasChanges = true;
          continue; // Bỏ qua bài học đã bị xóa
        }

        // Đồng bộ xóa file trong bài học
        const updatedFiles = [];
        for (const file of lesson.files || []) {
          // Kiểm tra file có driveFileId hợp lệ không
          const driveFileId = file.driveFileId;
          const fileExists = driveFileId ? syncState.processedItems.files.has(driveFileId) : false;

          // Nếu không có driveFileId hoặc không tìm thấy trong danh sách đã xử lý -> xóa
          if (!driveFileId || !fileExists) {
            const reason = !driveFileId 
              ? "không có driveFileId" 
              : "không còn tồn tại trên Drive";
            
            console.log(
              `File "${file.name}" (${reason}) đã bị xóa trên Drive, xóa khỏi hệ thống`
            );

            // Xóa file từ Wasabi nếu có
            if (file.storage?.provider === "wasabi" && file.storage?.key) {
              try {
                const deleted = await deleteFromWasabi(file.storage.key);
                if (deleted) {
                  deletedFilesCount++;
                } else {
                  failedDeletionsCount++;
                  console.warn(`Không thể xóa file: ${file.storage.key} từ Wasabi`);
                }
              } catch (err) {
                failedDeletionsCount++;
                console.error(`Lỗi khi xóa file từ Wasabi: ${err.message}`);
              }
            }

            hasChanges = true;
          } else {
            updatedFiles.push(file);
          }
        }

        // Đồng bộ xóa thư mục con
        const updatedSubfolders = [];

        for (const subfolder of lesson.subfolders || []) {
          if (!syncState.processedItems.subfolders.has(subfolder.id)) {
            console.log(
              `Thư mục con "${subfolder.name}" (${subfolder.id}) đã bị xóa trên Drive, xóa khỏi hệ thống`
            );

            // Xóa tất cả file trong subfolder khỏi Wasabi
            for (const file of subfolder.files || []) {
              if (file.storage?.provider === "wasabi" && file.storage?.key) {
                try {
                  const deleted = await deleteFromWasabi(file.storage.key);
                  if (deleted) {
                    deletedFilesCount++;
                  } else {
                    failedDeletionsCount++;
                    console.warn(`Không thể xóa file: ${file.storage.key} từ Wasabi`);
                  }
                } catch (err) {
                  failedDeletionsCount++;
                  console.error(`Lỗi khi xóa file từ Wasabi: ${err.message}`);
                }
              }
            }

            hasChanges = true;
            continue; // Bỏ qua thư mục con đã bị xóa
          }

          // Đồng bộ xóa file trong thư mục con
          const updatedSubfolderFiles = [];
          for (const file of subfolder.files || []) {
            // Kiểm tra file có driveFileId hợp lệ không
            const driveFileId = file.driveFileId;
            const fileExists = driveFileId ? syncState.processedItems.files.has(driveFileId) : false;

            // Nếu không có driveFileId hoặc không tìm thấy trong danh sách đã xử lý -> xóa
            if (!driveFileId || !fileExists) {
              const reason = !driveFileId 
                ? "không có driveFileId" 
                : "không còn tồn tại trên Drive";
                
              console.log(
                `File "${file.name}" (${reason}) trong thư mục con "${subfolder.name}" đã bị xóa trên Drive, xóa khỏi hệ thống`
              );

              // Xóa file từ Wasabi
              if (file.storage?.provider === "wasabi" && file.storage?.key) {
                try {
                  const deleted = await deleteFromWasabi(file.storage.key);
                  if (deleted) {
                    deletedFilesCount++;
                  } else {
                    failedDeletionsCount++;
                    console.warn(`Không thể xóa file: ${file.storage.key} từ Wasabi`);
                  }
                } catch (err) {
                  failedDeletionsCount++;
                  console.error(`Lỗi khi xóa file từ Wasabi: ${err.message}`);
                }
              }

              hasChanges = true;
            } else {
              updatedSubfolderFiles.push(file);
            }
          }

          updatedSubfolders.push({
            ...subfolder,
            files: updatedSubfolderFiles,
            updatedAt: new Date().toISOString(),
          });
        }

        updatedLessons.push({
          ...lesson,
          files: updatedFiles,
          subfolders: updatedSubfolders,
          updatedAt: new Date().toISOString(),
        });
      }

      updatedChapters.push({
        ...chapter,
        lessons: updatedLessons,
        totalLessons: updatedLessons.length,
        updatedAt: new Date().toISOString(),
      });
    }

    if (hasChanges) {
      // Cập nhật lại khóa học sau khi đồng bộ xóa
      await courseRef.update({
        chapters: updatedChapters,
        totalChapters: updatedChapters.length,
        totalLessons: updatedChapters.reduce(
          (total, chapter) => total + chapter.lessons.length,
          0
        ),
        updatedAt: new Date().toISOString(),
      });

      console.log(
        `Đã cập nhật khóa học sau khi đồng bộ xóa. Đã xóa ${deletedFilesCount} file trên Wasabi (${failedDeletionsCount} thất bại).`
      );
    } else {
      console.log("Không có mục nào bị xóa, không cần cập nhật");
    }

    console.log("=== Kết thúc đồng bộ các mục đã xóa ===\n");
    return { hasChanges, deletedFilesCount, failedDeletionsCount };
  } catch (error) {
    console.error("Lỗi khi đồng bộ các mục đã xóa:", error);
    return { hasChanges: false, deletedFilesCount: 0, failedDeletionsCount: 0 };
  }
}

// Thêm export mặc định cho route handler
export async function GET(request) {
  return NextResponse.json({ message: "API is working" });
}

// Sửa lại hàm chính để sử dụng getOrCreateCourse
export async function POST(request) {
  // Lưu hàm gốc vào biến ngoài phạm vi try-catch
  const originalUploadToWasabi = uploadToWasabi;

  try {
    console.log("\n=== Bắt đầu import khóa học ===");
    const {
      driveUrl,
      enableSync = true,
      courseId = null,
    } = await request.json();
    console.log("URL Drive:", driveUrl);
    console.log("Đồng bộ xóa:", enableSync ? "Bật" : "Tắt");
    console.log("CourseId:", courseId ? courseId : "Tạo mới");

    // Thêm biến thống kê tốc độ tổng
    const globalStats = {
      totalProcessedFiles: 0,
      totalSize: 0,
      totalDownloadTime: 0,
      totalUploadTime: 0,
      avgDownloadSpeed: 0,
      avgUploadSpeed: 0,
      startTime: Date.now(),
    };

    // Thêm hàm theo dõi hoạt động upload
    const trackFileUpload = (fileStats) => {
      if (fileStats && fileStats.success) {
        globalStats.totalProcessedFiles++;
        globalStats.totalSize += parseFloat(fileStats.fileSize || 0);

        // Tính thời gian tải và upload dựa trên tốc độ và kích thước
        if (parseFloat(fileStats.downloadSpeed) > 0) {
          globalStats.totalDownloadTime +=
            parseFloat(fileStats.fileSize) /
            parseFloat(fileStats.downloadSpeed);
        }

        if (parseFloat(fileStats.uploadSpeed) > 0) {
          globalStats.totalUploadTime +=
            parseFloat(fileStats.fileSize) / parseFloat(fileStats.uploadSpeed);
        }
      }
    };

    // Ghi đè hàm uploadToWasabi để theo dõi tốc độ
    uploadToWasabi = async (...args) => {
      const result = await originalUploadToWasabi(...args);
      trackFileUpload(result);
      return result;
    };

    // Làm mới cache trước khi bắt đầu import
    cache.fileChecks = {};
    cache.courseData = {};

    const folderId = extractDriveId(driveUrl);
    console.log("Folder ID:", folderId);

    if (!folderId) {
      return NextResponse.json(
        { error: "URL Google Drive không hợp lệ" },
        { status: 400 }
      );
    }

    let tokens = await readTokens();
    console.log("Tokens read:", {
      hasTokens: !!tokens,
      hasAccessToken: !!tokens?.access_token,
      tokenType: tokens?.token_type,
      expiryDate: tokens?.expiry_date,
      currentTime: Date.now(),
    });

    if (!tokens) {
      return NextResponse.json(
        {
          success: false,
          error: "Chưa có token. Vui lòng đăng nhập Google Drive trước.",
        },
        { status: 401 }
      );
    }

    if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
      console.log("Token đã hết hạn, đang tự động làm mới...");
      const refreshedTokens = await refreshDriveToken();

      if (!refreshedTokens) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Không thể làm mới token. Vui lòng đăng nhập lại Google Drive.",
          },
          { status: 401 }
        );
      }

      console.log("Đã làm mới token thành công");
      tokens = refreshedTokens;
    }

    if (!tokens.access_token) {
      return NextResponse.json(
        {
          success: false,
          error: "Token không hợp lệ. Vui lòng đăng nhập lại Google Drive.",
        },
        { status: 401 }
      );
    }

    console.log("Đã lấy được access token");

    const drive = await initializeDriveClient();
    console.log("Đã khởi tạo Drive API");

    try {
      const folderInfo = await getFolderInfo(drive, folderId);
      console.log("Thông tin thư mục gốc:", folderInfo);

      if (!folderInfo || !folderInfo.name) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Không thể lấy thông tin thư mục hoặc không có quyền truy cập.",
          },
          { status: 403 }
        );
      }

      // Khởi tạo lại trạng thái đồng bộ
      syncState.processedItems.chapters.clear();
      syncState.processedItems.lessons.clear();
      syncState.processedItems.files.clear();
      syncState.processedItems.subfolders.clear();
      syncState.needSync = enableSync;

      let course;

      if (courseId) {
        // Nếu có courseId, kiểm tra và sử dụng khóa học hiện có
        const courseRef = db.collection("courses").doc(courseId);
        const courseDoc = await courseRef.get();

        if (!courseDoc.exists) {
          return NextResponse.json(
            {
              success: false,
              error: "Không tìm thấy khóa học với ID đã cung cấp",
            },
            { status: 404 }
          );
        }

        course = { id: courseId, ...courseDoc.data(), isExisting: true };
        console.log(`Đã tìm thấy khóa học: ${course.id} (${course.title})`);

        // Cập nhật URL Drive nếu chưa có
        if (!course.driveUrl) {
          await courseRef.update({
            driveUrl: driveUrl,
            driveFolderId: folderId,
            updatedAt: new Date().toISOString(),
          });
          console.log(`Đã cập nhật Drive URL cho khóa học: ${driveUrl}`);
        }
      } else {
        // Nếu không có courseId, tạo khóa học mới
        course = await getOrCreateCourse(folderInfo.name, driveUrl, folderId);
        console.log(
          course.isExisting
            ? `Đã tìm thấy khóa học: ${course.id}`
            : `Đã tạo khóa học mới: ${course.id}`
        );

        // Cập nhật Drive URL cho khóa học mới hoặc hiện có
        if (!course.driveUrl) {
          const courseRef = db.collection("courses").doc(course.id);
          await courseRef.update({
            driveUrl: driveUrl,
            driveFolderId: folderId,
            updatedAt: new Date().toISOString(),
          });
          console.log(`Đã cập nhật Drive URL cho khóa học: ${driveUrl}`);
        }
      }

      // Truyền tên khóa học vào lần gọi đầu tiên của processFolder
      await processFolder(
        drive,
        folderId,
        course.id,
        "course",
        null,
        null,
        "",
        course.title
      );

      // Thực hiện đồng bộ xóa nếu được yêu cầu
      let syncResult = { hasChanges: false, deletedFilesCount: 0, failedDeletionsCount: 0 };
      if (enableSync && course.isExisting) {
        syncResult = await synchronizeDeletedItems(course.id);
      }

      const courseRef = db.collection("courses").doc(course.id);
      const courseDoc = await courseRef.get();
      const courseData = courseDoc.data();

      if (!courseData) {
        throw new Error("Không thể lấy dữ liệu khóa học sau khi import");
      }

      const structure = {
        name: courseData.title || "",
        type: "folder",
        children: (courseData.chapters || []).map((chapter) => ({
          name: chapter.title || "",
          type: "folder",
          children: (chapter.lessons || []).map((lesson) => {
            // Tạo danh sách các file trong thư mục gốc của bài học
            const rootFiles = (lesson.files || []).map((file) => ({
              name: file.name || "",
              type: "file",
              id: file.id,
              fileType: file.type,
            }));

            // Tạo danh sách các thư mục con và file trong đó
            const subfolderNodes = (lesson.subfolders || []).map(
              (subfolder) => ({
                name: subfolder.name || "",
                type: "folder",
                id: subfolder.id,
                children: (subfolder.files || []).map((file) => ({
                  name: file.name || "",
                  type: "file",
                  id: file.id,
                  fileType: file.type,
                })),
              })
            );

            return {
              name: lesson.title || "",
              type: "folder",
              id: lesson.id,
              // Gộp files gốc và subfolders vào danh sách children
              children: [...rootFiles, ...subfolderNodes],
            };
          }),
        })),
      };

      console.log("=== Kết thúc import khóa học ===\n");

      // Tính toán tốc độ trung bình
      const totalTime = (Date.now() - globalStats.startTime) / 1000; // Thời gian tổng cộng (giây)

      if (globalStats.totalProcessedFiles > 0) {
        globalStats.avgDownloadSpeed =
          globalStats.totalDownloadTime > 0
            ? (globalStats.totalSize / globalStats.totalDownloadTime).toFixed(2)
            : 0;
        globalStats.avgUploadSpeed =
          globalStats.totalUploadTime > 0
            ? (globalStats.totalSize / globalStats.totalUploadTime).toFixed(2)
            : 0;

        console.log("\n=== THỐNG KÊ TỐC ĐỘ TỔNG THỂ ===");
        console.log(
          `Số lượng file đã xử lý: ${globalStats.totalProcessedFiles}`
        );
        console.log(`Tổng kích thước: ${globalStats.totalSize.toFixed(2)} MB`);
        console.log(`Thời gian xử lý: ${totalTime.toFixed(2)} giây`);
        console.log(
          `Tốc độ tải trung bình: ${globalStats.avgDownloadSpeed} MB/s`
        );
        console.log(
          `Tốc độ upload trung bình: ${globalStats.avgUploadSpeed} MB/s`
        );
        console.log("==============================\n");
      }

      return NextResponse.json({
        success: true,
        title: courseData.title || "",
        structure: structure,
        courseId: course.id,
        syncPerformed: enableSync && course.isExisting,
        syncResult: syncResult,
        message: course.isExisting
          ? `Khóa học đã tồn tại, đã cập nhật nội dung${
              syncResult.hasChanges 
                ? ` và đồng bộ xóa ${syncResult.deletedFilesCount} file (${syncResult.failedDeletionsCount} thất bại)` 
                : ""
            }`
          : "Import khóa học mới thành công",
        stats: {
          totalFiles: globalStats.totalProcessedFiles,
          totalSize: globalStats.totalSize.toFixed(2),
          totalTime: totalTime.toFixed(2),
          avgDownloadSpeed: globalStats.avgDownloadSpeed,
          avgUploadSpeed: globalStats.avgUploadSpeed,
        },
      });
    } catch (error) {
      console.error("Lỗi khi lấy thông tin thư mục:", error);
      return NextResponse.json(
        {
          success: false,
          error: `Lỗi khi lấy thông tin thư mục: ${error.message}`,
        },
        { status: 500 }
      );
    } finally {
      // Đảm bảo khôi phục lại hàm uploadToWasabi gốc trong mọi trường hợp
      uploadToWasabi = originalUploadToWasabi;
    }
  } catch (error) {
    console.error("Lỗi khi import khóa học:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi import khóa học",
      },
      { status: 500 }
    );
  }
}

// Thêm hàm kiểm tra file tồn tại trên Wasabi
async function checkWasabiFile(key) {
  if (!key) {
    console.warn("Không có key file để kiểm tra trên Wasabi");
    return false;
  }

  try {
    console.log(`Kiểm tra file tồn tại trên Wasabi với key: ${key}`);

    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      await s3Client.send(command);
      console.log(`File tồn tại trên Wasabi: ${key}`);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.Code === 'NotFound' || error.name === 'NoSuchKey') {
        console.warn(`File không tồn tại trên Wasabi: ${key}`);
        return false;
      }
      // Nếu lỗi khác không phải NotFound, coi như file có thể tồn tại
      console.warn(`Lỗi khi kiểm tra file trên Wasabi: ${error.message}`);
      return true;
    }
  } catch (error) {
    console.error(`Lỗi khi kiểm tra file tồn tại trên Wasabi (${key}):`, error);
    // Trong trường hợp lỗi, trả về true để tránh tải lại file không cần thiết
    return true;
  }
}

// Cập nhật hàm addFileToLesson để sử dụng logic mới
async function addFileToLesson(
  courseId,
  chapterId,
  lessonId,
  file,
  subfolderId = null
) {
  try {
    if (!courseId || !chapterId || !lessonId || !file) {
      throw new Error("Thiếu thông tin cần thiết để thêm file");
    }

    // Kiểm tra trùng lặp và xác định xem có cần tải lên không
    const { needUpload, fileData } = await checkAndDeleteDuplicateFiles(
      courseId, 
      chapterId, 
      lessonId, 
      file.name,
      subfolderId
    );

    // Nếu không cần tải lên và đã có file hiện có -> không cần làm gì thêm
    if (!needUpload && fileData) {
      console.log(`File ${file.name} đã tồn tại với key Wasabi hợp lệ, bỏ qua thêm file`);
      return fileData;
    }

    // Nếu có file cũ cần cập nhật
    if (needUpload && fileData) {
      console.log(`Cập nhật file ${file.name} hiện có với key Wasabi mới`);
      
      // Nếu không có dữ liệu Wasabi mới, không thể cập nhật
      if (!file.wasabi) {
        console.warn(`Không có thông tin Wasabi để cập nhật file ${file.name}`);
        return fileData;
      }
      
      const updatedFile = {
        ...fileData,
        storage: {
          provider: "wasabi",
          key: file.wasabi.key,
          size: file.wasabi.size,
          uploadTime: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString()
      };

      // Cập nhật file trong database
      const courseRef = db.collection("courses").doc(courseId);
      const courseDoc = await courseRef.get();
      
      if (!courseDoc.exists) {
        throw new Error("Không tìm thấy khóa học");
      }
      
      const courseData = courseDoc.data();
      
      if (subfolderId) {
        // Cập nhật file trong subfolder
        const updatedChapters = courseData.chapters.map(c => {
          if (c.id === chapterId) {
            const updatedLessons = c.lessons.map(l => {
              if (l.id === lessonId) {
                const updatedSubfolders = l.subfolders.map(sf => {
                  if (sf.id === subfolderId) {
                    const updatedFiles = sf.files.map(f => {
                      if (f.id === fileData.id) {
                        return updatedFile;
                      }
                      return f;
                    });
                    
                    return { ...sf, files: updatedFiles, updatedAt: new Date().toISOString() };
                  }
                  return sf;
                });
                
                return { ...l, subfolders: updatedSubfolders, updatedAt: new Date().toISOString() };
              }
              return l;
            });
            
            return { ...c, lessons: updatedLessons };
          }
          return c;
        });
        
        await courseRef.update({
          chapters: updatedChapters,
          updatedAt: new Date().toISOString()
        });
        
        console.log(`Đã cập nhật key Wasabi cho file ${file.name} trong subfolder`);
      } else {
        // Cập nhật file trong lesson
        const updatedChapters = courseData.chapters.map(c => {
          if (c.id === chapterId) {
            const updatedLessons = c.lessons.map(l => {
              if (l.id === lessonId) {
                const updatedFiles = l.files.map(f => {
                  if (f.id === fileData.id) {
                    return updatedFile;
                  }
                  return f;
                });
                
                return { ...l, files: updatedFiles, updatedAt: new Date().toISOString() };
              }
              return l;
            });
            
            return { ...c, lessons: updatedLessons };
          }
          return c;
        });
        
        await courseRef.update({
          chapters: updatedChapters,
          updatedAt: new Date().toISOString()
        });
        
        console.log(`Đã cập nhật key Wasabi cho file ${file.name} trong lesson`);
      }
      
      return updatedFile;
    }

    // Trường hợp tạo file mới 
    const fileType = getFileType(file.mimeType);

    const newFileData = {
      id: uuidv4(),
      mimeType: file.mimeType,
      name: file.name,
      originalName: file.name,
      type: fileType,
      uploadTime: new Date().toISOString(),
      driveFileId: file.id || null,
      status: "active",
      size: file.size?.toString() || "0",
      modifiedTime: file.modifiedTime || new Date().toISOString(),
    };

    if (file.wasabi) {
      newFileData.storage = {
        provider: "wasabi",
        key: file.wasabi.key,
        size: file.wasabi.size,
        uploadTime: new Date().toISOString(),
      };
    } else {
      const encryptedId = encryptId(file.id);
      newFileData.proxyUrl = `/api/proxy/files?id=${encryptedId}`;
    }

    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      throw new Error("Không tìm thấy khóa học");
    }

    const courseData = courseDoc.data();
    const chapter = courseData.chapters.find((c) => c.id === chapterId);

    if (!chapter) {
      throw new Error("Không tìm thấy chapter");
    }

    const lesson = chapter.lessons.find((l) => l.id === lessonId);

    if (!lesson) {
      throw new Error("Không tìm thấy lesson");
    }

    const updatedChapters = courseData.chapters.map((c) => {
      if (c.id === chapterId) {
        const updatedLessons = c.lessons.map((l) => {
          if (l.id === lessonId) {
            if (subfolderId) {
              const updatedSubfolders = (l.subfolders || []).map((sf) => {
                if (sf.id === subfolderId) {
                  return {
                    ...sf,
                    files: [...(sf.files || []), newFileData],
                    updatedAt: new Date().toISOString(),
                  };
                }
                return sf;
              });

              return {
                ...l,
                subfolders: updatedSubfolders,
                updatedAt: new Date().toISOString(),
              };
            } else {
              return {
                ...l,
                files: [...(l.files || []), newFileData],
                updatedAt: new Date().toISOString(),
              };
            }
          }
          return l;
        });
        return { ...c, lessons: updatedLessons };
      }
      return c;
    });

    await courseRef.update({
      chapters: updatedChapters,
      updatedAt: new Date().toISOString(),
    });

    const location = subfolderId ? "subfolder" : "lesson";
    console.log(
      `Đã thêm file ${file.name} vào ${location} ${subfolderId || lessonId}`
    );
    return newFileData;
  } catch (error) {
    console.error("Lỗi khi thêm file:", error);
    throw error;
  }
}

// Thêm lại hàm getFileType - đã bị mất trong quá trình chỉnh sửa
function getFileType(mimeType) {
  const videoTypes = ["video/mp4", "video/webm", "video/ogg"];
  const documentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  const imageTypes = ["image/jpeg", "image/png", "image/gif"];

  if (videoTypes.includes(mimeType)) return "video";
  if (documentTypes.includes(mimeType)) return "document";
  if (imageTypes.includes(mimeType)) return "image";
  return "other";
}
