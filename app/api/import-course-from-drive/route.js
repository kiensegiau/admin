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

// Hàm upload file từ Google Drive lên Wasabi
async function uploadToWasabi(drive, fileId, fileName, mimeType) {
  try {
    const tempDir = path.join(os.tmpdir(), "hocmai-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Chỉ làm sạch tên file để lưu vào bộ nhớ tạm, tránh lỗi hệ thống tệp
    const sanitizedFileName = sanitizeFileName(fileName);
    const tempFilePath = path.join(tempDir, sanitizedFileName);

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

    await pipeline(fileStream.data, writer);

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
    const fileBuffer = fs.readFileSync(tempFilePath);

    // Tạo key cho file trên Wasabi với UUID để đảm bảo không trùng lặp
    // Vẫn sử dụng tên file gốc cho key trên Wasabi
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8); // Lấy 8 ký tự đầu của UUID
    let key = `videos/${timestamp}-${uniqueId}-${fileName}`;

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

    await s3Client.send(command);

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
    fs.unlinkSync(tempFilePath);

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
    return {
      success: false,
      error: error.message,
    };
  }
}

// Hàm làm sạch tên file chỉ dùng cho file tạm
function sanitizeFileName(fileName) {
  // Danh sách các ký tự không hợp lệ trong tên file Windows
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
  // Thay thế các ký tự không hợp lệ bằng dấu gạch ngang
  let sanitized = fileName.replace(invalidChars, "-");

  // Đảm bảo tên file không vượt quá 255 ký tự
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    sanitized = sanitized.substring(0, 255 - ext.length) + ext;
  }

  return sanitized;
}

// Thêm hàm kiểm tra và trả về khóa học nếu đã tồn tại hoặc tạo mới nếu chưa có
async function getOrCreateCourse(name) {
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

    const fileType = getFileType(file.mimeType);

    const fileData = {
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
      fileData.storage = {
        provider: "wasabi",
        key: file.wasabi.key,
        size: file.wasabi.size,
        uploadTime: new Date().toISOString(),
      };
    } else {
      const encryptedId = encryptId(file.id);
      fileData.proxyUrl = `/api/proxy/files?id=${encryptedId}`;
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
                    files: [...(sf.files || []), fileData],
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
                files: [...(l.files || []), fileData],
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
    return fileData;
  } catch (error) {
    console.error("Lỗi khi thêm file:", error);
    throw error;
  }
}

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

// Khôi phục lại hàm checkFileExists về logic ban đầu
async function checkFileExists(
  courseId,
  chapterId,
  lessonId,
  fileName,
  subfolderName = null,
  driveFileId = null
) {
  try {
    // Tạo key cho cache - thêm thông tin subfolder và driveFileId
    const cacheKey = `${courseId}_${chapterId}_${lessonId}_${
      subfolderName || "root"
    }_${fileName}_${driveFileId || ""}`;

    // Kiểm tra cache trước
    if (cache.fileChecks[cacheKey] !== undefined) {
      return cache.fileChecks[cacheKey];
    }

    // Nếu đã cache dữ liệu khóa học, sử dụng từ cache
    let courseData;
    if (cache.courseData[courseId]) {
      courseData = cache.courseData[courseId];
    } else {
      const courseRef = db.collection("courses").doc(courseId);
      const courseDoc = await courseRef.get();

      if (!courseDoc.exists) {
        cache.fileChecks[cacheKey] = { exists: false, hasWasabi: false };
        return { exists: false, hasWasabi: false };
      }

      courseData = courseDoc.data();
      // Cache lại dữ liệu khóa học để sử dụng lần sau
      cache.courseData[courseId] = courseData;
    }

    const chapter = courseData.chapters.find((c) => c.id === chapterId);

    if (!chapter) {
      cache.fileChecks[cacheKey] = { exists: false, hasWasabi: false };
      return { exists: false, hasWasabi: false };
    }

    const lesson = chapter.lessons.find((l) => l.id === lessonId);

    if (!lesson) {
      cache.fileChecks[cacheKey] = { exists: false, hasWasabi: false };
      return { exists: false, hasWasabi: false };
    }

    let fileFound = null;

    if (subfolderName) {
      // Kiểm tra file trong subfolder cụ thể
      const targetSubfolder = lesson.subfolders?.find(
        (sf) => sf.name === subfolderName
      );
      if (targetSubfolder) {
        fileFound = targetSubfolder.files?.find((file) => {
          // Nếu có driveFileId, kiểm tra cả tên và ID
          if (driveFileId) {
            return file.name === fileName && file.driveFileId === driveFileId;
          }
          return file.name === fileName;
        });

        if (fileFound) {
          console.log(
            `File "${fileName}" đã tồn tại trong subfolder "${subfolderName}"`
          );
        }
      }
    } else {
      // Kiểm tra file trực tiếp trong lesson
      fileFound = lesson.files?.find((file) => {
        // Nếu có driveFileId, kiểm tra cả tên và ID
        if (driveFileId) {
          return file.name === fileName && file.driveFileId === driveFileId;
        }
        return file.name === fileName;
      });

      if (fileFound) {
        console.log(`File "${fileName}" đã tồn tại trực tiếp trong lesson`);
      }
    }

    const result = {
      exists: !!fileFound,
      hasWasabi:
        fileFound?.storage?.provider === "wasabi" && !!fileFound?.storage?.key,
      fileData: fileFound,
    };

    if (result.exists) {
      if (result.hasWasabi) {
        console.log(
          `File "${fileName}" đã có key Wasabi: ${fileFound.storage.key}`
        );
      } else {
        console.log(
          `File "${fileName}" tồn tại nhưng chưa có key Wasabi, cần tải lại`
        );
      }
    }

    // Lưu kết quả vào cache
    cache.fileChecks[cacheKey] = result;
    return result;
  } catch (error) {
    console.error("Lỗi khi kiểm tra file tồn tại:", error);
    return { exists: false, hasWasabi: false };
  }
}

// Sửa lại hàm processFiles để xử lý file tồn tại nhưng chưa có key Wasabi
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

    const fileCheckResult = await checkFileExists(
      courseId,
      parentId,
      lessonId,
      file.name,
      subfolderName,
      file.id // DriveFileId
    );

    // Nếu file chưa tồn tại HOẶC đã tồn tại nhưng chưa có key Wasabi thì thêm vào danh sách xử lý
    if (
      !fileCheckResult.exists ||
      (fileCheckResult.exists && !fileCheckResult.hasWasabi)
    ) {
      filesToProcess.push({
        ...file,
        existingData: fileCheckResult.exists ? fileCheckResult.fileData : null,
      });
    } else {
      console.log(`File ${file.name} đã tồn tại và có key Wasabi, bỏ qua.`);
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

          const uploadResult = await uploadToWasabi(
            drive,
            file.id,
            file.name,
            file.mimeType
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
                ? parseFloat(uploadResult.fileSize) /
                  parseFloat(uploadResult.uploadSpeed)
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
  parentPath = ""
) {
  try {
    console.log(`\n=== Bắt đầu xử lý thư mục ${parentPath} ===`);
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
      const newPath = parentPath ? `${parentPath}/${folder.name}` : folder.name;

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
          newPath
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
          newPath
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
          subfolderId
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
        // Sử dụng hàm mới để xử lý file
        await processFiles(
          drive,
          validFiles,
          courseId,
          parentId,
          lessonId,
          parentType,
          parentPath
        );
      }
    }

    console.log(`=== Kết thúc xử lý thư mục ${parentPath || "gốc"} ===\n`);
  } catch (error) {
    console.error(`Lỗi khi xử lý thư mục ${parentPath || "gốc"}:`, error);
    throw error;
  }
}

// Thêm hàm xóa file từ Wasabi storage
async function deleteFromWasabi(key) {
  if (!key) {
    console.warn("Không có key file để xóa từ Wasabi");
    return false;
  }

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
    return false;
  }
}

// Cập nhật hàm synchronizeDeletedItems để xóa file trên Wasabi
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
              const deleted = await deleteFromWasabi(file.storage.key);
              if (deleted) deletedFilesCount++;
            }
          }

          // Xóa file trong subfolder
          for (const subfolder of lesson.subfolders || []) {
            for (const file of subfolder.files || []) {
              if (file.storage?.provider === "wasabi" && file.storage?.key) {
                const deleted = await deleteFromWasabi(file.storage.key);
                if (deleted) deletedFilesCount++;
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
              const deleted = await deleteFromWasabi(file.storage.key);
              if (deleted) deletedFilesCount++;
            }
          }

          // Xóa file trong subfolder
          for (const subfolder of lesson.subfolders || []) {
            for (const file of subfolder.files || []) {
              if (file.storage?.provider === "wasabi" && file.storage?.key) {
                const deleted = await deleteFromWasabi(file.storage.key);
                if (deleted) deletedFilesCount++;
              }
            }
          }

          hasChanges = true;
          continue; // Bỏ qua bài học đã bị xóa
        }

        // Đồng bộ xóa file trong bài học
        const updatedFiles = [];
        for (const file of lesson.files || []) {
          const fileExists = syncState.processedItems.files.has(
            file.driveFileId
          );
          if (!fileExists) {
            console.log(
              `File "${file.name}" đã bị xóa trên Drive, xóa khỏi hệ thống`
            );

            // Xóa file từ Wasabi
            if (file.storage?.provider === "wasabi" && file.storage?.key) {
              const deleted = await deleteFromWasabi(file.storage.key);
              if (deleted) deletedFilesCount++;
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
                const deleted = await deleteFromWasabi(file.storage.key);
                if (deleted) deletedFilesCount++;
              }
            }

            hasChanges = true;
            continue; // Bỏ qua thư mục con đã bị xóa
          }

          // Đồng bộ xóa file trong thư mục con
          const updatedSubfolderFiles = [];
          for (const file of subfolder.files || []) {
            const fileExists = syncState.processedItems.files.has(
              file.driveFileId
            );
            if (!fileExists) {
              console.log(
                `File "${file.name}" trong thư mục con "${subfolder.name}" đã bị xóa trên Drive, xóa khỏi hệ thống`
              );

              // Xóa file từ Wasabi
              if (file.storage?.provider === "wasabi" && file.storage?.key) {
                const deleted = await deleteFromWasabi(file.storage.key);
                if (deleted) deletedFilesCount++;
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
        `Đã cập nhật khóa học sau khi đồng bộ xóa. Đã xóa ${deletedFilesCount} file trên Wasabi.`
      );
    } else {
      console.log("Không có mục nào bị xóa, không cần cập nhật");
    }

    console.log("=== Kết thúc đồng bộ các mục đã xóa ===\n");
    return { hasChanges, deletedFilesCount };
  } catch (error) {
    console.error("Lỗi khi đồng bộ các mục đã xóa:", error);
    return { hasChanges: false, deletedFilesCount: 0 };
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
    const { driveUrl, enableSync = true } = await request.json();
    console.log("URL Drive:", driveUrl);
    console.log("Đồng bộ xóa:", enableSync ? "Bật" : "Tắt");

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

      // Thay đổi từ createNewCourse sang getOrCreateCourse
      const course = await getOrCreateCourse(folderInfo.name);
      console.log(
        course.isExisting
          ? `Đã tìm thấy khóa học: ${course.id}`
          : `Đã tạo khóa học mới: ${course.id}`
      );

      await processFolder(drive, folderId, course.id);

      // Thực hiện đồng bộ xóa nếu được yêu cầu
      let syncResult = false;
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
        hasRemovedItems: syncResult,
        message: course.isExisting
          ? `Khóa học đã tồn tại, đã cập nhật nội dung${
              syncResult ? " và đồng bộ các mục đã xóa" : ""
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
