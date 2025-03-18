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
    };

    if (file.wasabi) {
      fileData.storage = {
        provider: "wasabi",
        key: file.wasabi.key,
        size: file.wasabi.size,
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

// Sửa lại hàm xử lý đệ quy cho các thư mục
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
        console.log(
          `\n=== Bắt đầu xử lý ${validFiles.length} files lên Wasabi từ ${
            parentPath || "thư mục gốc"
          } ===`
        );

        for (const file of validFiles) {
          try {
            // Kiểm tra xem file đã tồn tại chưa (dựa vào tên file)
            const isExistingFile = await checkFileExists(
              courseId,
              parentId,
              lessonId,
              file.name,
              parentType === "subfolder"
            );

            if (isExistingFile) {
              console.log(`File ${file.name} đã tồn tại, bỏ qua.`);
              continue;
            }

            console.log(`\nĐang xử lý file: ${file.name} (${file.mimeType})`);

            const uploadResult = await uploadToWasabi(
              drive,
              file.id,
              file.name,
              file.mimeType
            );

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

            if (uploadResult.success) {
              console.log(
                `File ${file.name} upload thành công lên Wasabi, key: ${uploadResult.key}`
              );

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
            } else {
              console.warn(
                `Upload thất bại cho file ${file.name}:`,
                uploadResult.error
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
            const subfolderId =
              parentType === "subfolder" && parentPath
                ? await getOrCreateSubfolder(
                    courseId,
                    parentId,
                    lessonId,
                    parentPath.split("/").pop()
                  )
                : null;
            await addFileToLesson(
              courseId,
              parentId,
              lessonId,
              file,
              subfolderId
            );
          }
        }
      }
    }

    console.log(`=== Kết thúc xử lý thư mục ${parentPath || "gốc"} ===\n`);
  } catch (error) {
    console.error(`Lỗi khi xử lý thư mục ${parentPath || "gốc"}:`, error);
    throw error;
  }
}

// Thêm hàm kiểm tra file đã tồn tại chưa
async function checkFileExists(
  courseId,
  chapterId,
  lessonId,
  fileName,
  isSubfolder
) {
  try {
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return false;
    }

    const courseData = courseDoc.data();
    const chapter = courseData.chapters.find((c) => c.id === chapterId);

    if (!chapter) {
      return false;
    }

    const lesson = chapter.lessons.find((l) => l.id === lessonId);

    if (!lesson) {
      return false;
    }

    if (isSubfolder) {
      // Kiểm tra file trong các subfolder
      if (!lesson.subfolders || lesson.subfolders.length === 0) {
        return false;
      }

      for (const subfolder of lesson.subfolders) {
        const fileExists = subfolder.files?.some(
          (file) => file.name === fileName
        );
        if (fileExists) return true;
      }

      return false;
    } else {
      // Kiểm tra file trực tiếp trong lesson
      return lesson.files?.some((file) => file.name === fileName) || false;
    }
  } catch (error) {
    console.error("Lỗi khi kiểm tra file tồn tại:", error);
    return false;
  }
}

// Sửa lại hàm chính để sử dụng getOrCreateCourse
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

      // Thay đổi từ createNewCourse sang getOrCreateCourse
      const course = await getOrCreateCourse(folderInfo.name);
      console.log(
        course.isExisting
          ? `Đã tìm thấy khóa học: ${course.id}`
          : `Đã tạo khóa học mới: ${course.id}`
      );

      await processFolder(drive, folderId, course.id);

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

      return NextResponse.json({
        success: true,
        title: courseData.title || "",
        structure: structure,
        courseId: course.id,
        message: course.isExisting
          ? "Khóa học đã tồn tại, đã cập nhật thêm nội dung mới"
          : "Import khóa học mới thành công",
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
