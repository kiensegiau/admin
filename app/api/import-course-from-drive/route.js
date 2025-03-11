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
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

    const tempFilePath = path.join(tempDir, fileName);

    console.log(`Đang tải file ${fileName} từ Google Drive...`);

    // Sử dụng retryWithNewToken để đảm bảo token không hết hạn khi tải file lớn
    const fileStream = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      { responseType: "stream" }
    );

    // Đối với file lớn, sử dụng stream để download
    const writer = fs.createWriteStream(tempFilePath);
    await pipeline(fileStream.data, writer);

    console.log(`File đã được tải về: ${tempFilePath}`);

    // Đọc file để upload lên Wasabi
    const fileBuffer = fs.readFileSync(tempFilePath);

    // Tạo key cho file trên Wasabi
    const timestamp = Date.now();
    const key = `videos/${timestamp}-${fileName}`;

    // Upload lên Wasabi
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    await s3Client.send(command);
    console.log(`File đã được upload lên Wasabi: ${key}`);

    // Xóa file tạm
    fs.unlinkSync(tempFilePath);

    // Trả về key để lưu trong database
    return {
      success: true,
      key: key,
      size: fileBuffer.length,
    };
  } catch (error) {
    console.error("Lỗi khi upload file lên Wasabi:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

async function createNewCourse(name) {
  try {
    if (!name || typeof name !== "string") {
      throw new Error("Tên khóa học không hợp lệ");
    }

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
    return { id: courseRef.id, ...courseData };
  } catch (error) {
    console.error("Lỗi khi tạo khóa học:", error);
    throw new Error("Không thể tạo khóa học mới: " + error.message);
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

async function addFileToLesson(courseId, chapterId, lessonId, file) {
  try {
    if (!courseId || !chapterId || !lessonId || !file) {
      throw new Error("Thiếu thông tin cần thiết để thêm file");
    }

    const fileType = getFileType(file.mimeType);

    // File data với cấu trúc mới, chỉ lưu key cho tất cả file
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
    };

    // Nếu file có storage key từ Wasabi, lưu key vào database
    if (file.wasabi) {
      fileData.storage = {
        provider: "wasabi",
        key: file.wasabi.key,
        size: file.wasabi.size,
      };
    } else {
      // Fallback nếu không upload được lên Wasabi
      // Lưu URL proxy để vẫn có thể truy cập qua Google Drive
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

    const updatedChapters = courseData.chapters.map((chapter) => {
      if (chapter.id === chapterId) {
        const updatedLessons = chapter.lessons.map((lesson) => {
          if (lesson.id === lessonId) {
            return {
              ...lesson,
              files: [...(lesson.files || []), fileData],
              updatedAt: new Date().toISOString(),
            };
          }
          return lesson;
        });
        return { ...chapter, lessons: updatedLessons };
      }
      return chapter;
    });

    await courseRef.update({
      chapters: updatedChapters,
      updatedAt: new Date().toISOString(),
    });

    console.log(`Đã thêm file ${file.name} vào lesson ${lessonId}`);
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

async function processFolder(
  drive,
  folderId,
  courseId,
  parentType = "course",
  parentId = null,
  lessonId = null
) {
  try {
    console.log(`\n=== Bắt đầu xử lý thư mục ===`);
    console.log(`ParentType: ${parentType}, CourseId: ${courseId}`);

    const files = await listFolderContents(drive, folderId);
    const folders = files.filter(
      (f) => f.mimeType === "application/vnd.google-apps.folder"
    );
    const documents = files.filter(
      (f) => f.mimeType !== "application/vnd.google-apps.folder"
    );

    // Xử lý các thư mục (chapters hoặc lessons)
    for (const folder of folders) {
      if (parentType === "course") {
        const chapterId = await createChapter(courseId, folder.name);
        await processFolder(drive, folder.id, courseId, "chapter", chapterId);
      } else if (parentType === "chapter") {
        const { lessonId: newLessonId } = await createLesson(
          courseId,
          parentId,
          folder.name
        );
        await processFolder(
          drive,
          folder.id,
          courseId,
          "lesson",
          parentId,
          newLessonId
        );
      }
    }

    // Xử lý các file trong lesson
    if (parentType === "lesson" && lessonId) {
      // Lọc những file có mime type hợp lệ để lưu
      const validFiles = documents.filter((file) => {
        const type = getFileType(file.mimeType);
        return type !== "other"; // Bỏ qua những file không được hỗ trợ
      });

      if (validFiles.length > 0) {
        console.log(
          `\n=== Bắt đầu xử lý ${validFiles.length} files lên Wasabi ===`
        );

        for (const file of validFiles) {
          try {
            console.log(`\nĐang xử lý file: ${file.name} (${file.mimeType})`);

            // Upload file lên Wasabi
            const uploadResult = await uploadToWasabi(
              drive,
              file.id,
              file.name,
              file.mimeType
            );

            if (uploadResult.success) {
              console.log(
                `File ${file.name} upload thành công lên Wasabi, key: ${uploadResult.key}`
              );

              // Thêm file vào lesson với thông tin Wasabi
              await addFileToLesson(courseId, parentId, lessonId, {
                ...file,
                wasabi: {
                  key: uploadResult.key,
                  size: uploadResult.size,
                },
              });
            } else {
              console.warn(
                `Upload thất bại cho file ${file.name}:`,
                uploadResult.error
              );
              // Vẫn thêm file nhưng không có key Wasabi, sẽ dùng proxy URL
              await addFileToLesson(courseId, parentId, lessonId, file);
            }
          } catch (error) {
            console.error(`Lỗi khi xử lý file ${file.name}:`, error);
            // Vẫn thêm file dù có lỗi, sẽ dùng proxy URL
            await addFileToLesson(courseId, parentId, lessonId, file);
          }
        }
      }
    }

    console.log(`=== Kết thúc xử lý thư mục ===\n`);
  } catch (error) {
    console.error("Lỗi khi xử lý thư mục:", error);
    throw error;
  }
}

export async function POST(request) {
  try {
    console.log("\n=== Bắt đầu import khóa học ===");
    const { driveUrl } = await request.json();
    console.log("URL Drive:", driveUrl);

    const folderId = extractDriveId(driveUrl);
    console.log("Folder ID:", folderId);

    if (!folderId) {
      return NextResponse.json(
        { error: "URL Google Drive không hợp lệ" },
        { status: 400 }
      );
    }

    // Thêm await ở đây
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

    // Kiểm tra token hết hạn và tự động làm mới nếu cần
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

    // Khởi tạo Drive API - Không cần truyền access_token nữa
    const drive = await initializeDriveClient();
    console.log("Đã khởi tạo Drive API");

    // Lấy thông tin thư mục gốc
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

      // Tạo khóa học mới
      const newCourse = await createNewCourse(folderInfo.name);
      console.log("Đã tạo khóa học mới:", newCourse);

      // Xử lý cấu trúc thư mục
      await processFolder(drive, folderId, newCourse.id);

      // Lấy dữ liệu khóa học sau khi đã import xong
      const courseRef = db.collection("courses").doc(newCourse.id);
      const courseDoc = await courseRef.get();
      const courseData = courseDoc.data();

      if (!courseData) {
        throw new Error("Không thể lấy dữ liệu khóa học sau khi import");
      }

      // Format dữ liệu theo cấu trúc mà component cần
      const structure = {
        name: courseData.title || "",
        type: "folder",
        children: (courseData.chapters || []).map((chapter) => ({
          name: chapter.title || "",
          type: "folder",
          children: (chapter.lessons || []).map((lesson) => ({
            name: lesson.title || "",
            type: "folder",
            children: (lesson.files || []).map((file) => ({
              name: file.name || "",
              type: "file",
            })),
          })),
        })),
      };

      console.log("=== Kết thúc import khóa học ===\n");

      return NextResponse.json({
        success: true,
        title: courseData.title || "",
        structure: structure,
        message: "Import khóa học thành công",
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
