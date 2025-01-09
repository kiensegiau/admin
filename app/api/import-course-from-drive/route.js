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

    // Mã hóa ID của file sử dụng hàm từ lib/encryption
    const encryptedId = encryptId(file.id);

    const fileData = {
      id: uuidv4(),
      mimeType: file.mimeType,
      name: file.name,
      originalName: file.name,
      proxyUrl: `/api/proxy/files?id=${encryptedId}`,
      size: file.size.toString(),
      type: getFileType(file.mimeType),
      uploadTime: new Date().toISOString(),
      driveFileId: file.id || null,
      status: "active",
    };

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

// Hàm xác định loại file
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
    console.log(`ParentType: ${parentType}`);
    console.log(`CourseId: ${courseId}`);
    console.log(`ParentId: ${parentId}`);
    console.log(`LessonId: ${lessonId}`);

    const files = await listFolderContents(drive, folderId);
    console.log(`\nDanh sách files trong thư mục:`, files);

    const folders = files.filter(
      (f) => f.mimeType === "application/vnd.google-apps.folder"
    );
    const documents = files.filter(
      (f) => f.mimeType !== "application/vnd.google-apps.folder"
    );

    console.log(`\nSố lượng thư mục con: ${folders.length}`);
    console.log(`Số lượng tài liệu: ${documents.length}`);

    // Xử lý các thư mục (chapters hoặc lessons)
    for (const folder of folders) {
      console.log(`\n-> Xử lý thư mục: ${folder.name}`);
      if (parentType === "course") {
        console.log(`Tạo chapter mới: ${folder.name}`);
        const chapterId = await createChapter(courseId, folder.name);
        console.log(`Đã tạo chapter với ID: ${chapterId}`);
        await processFolder(drive, folder.id, courseId, "chapter", chapterId);
      } else if (parentType === "chapter") {
        console.log(`Tạo lesson mới trong chapter: ${folder.name}`);
        const { lessonId: newLessonId } = await createLesson(
          courseId,
          parentId,
          folder.name
        );
        console.log(`Đã tạo lesson với ID: ${newLessonId}`);
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
      console.log(`\n-> Xử lý files trong lesson ${lessonId}:`);
      for (const file of documents) {
        console.log(`Xử lý file: ${file.name}`);
        const fileType = getFileType(file.mimeType);
        if (fileType !== "other") {
          console.log(`Thêm file ${file.name} vào lesson`);
          await addFileToLesson(courseId, parentId, lessonId, file);
        } else {
          console.warn(`Bỏ qua file không được hỗ trợ: ${file.name}`);
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

    // Lấy access token
    const tokens = readTokens();
    if (!tokens?.access_token) {
      throw new Error("Không tìm thấy access token");
    }
    console.log("Đã lấy được access token");

    // Khởi tạo Drive API
    const drive = await initializeDriveClient(tokens.access_token);
    console.log("Đã khởi tạo Drive API");

    // Lấy thông tin thư mục gốc
    const folderInfo = await getFolderInfo(drive, folderId);
    console.log("Thông tin thư mục gốc:", folderInfo.data);

    // Tạo khóa học mới
    const newCourse = await createNewCourse(folderInfo.data.name);
    console.log("Đã tạo khóa học mới:", newCourse);

    // Xử lý cấu trúc thư mục
    await processFolder(drive, folderId, newCourse.id);

    console.log("=== Kết thúc import khóa học ===\n");

    return NextResponse.json({
      success: true,
      courseId: newCourse.id,
      message: "Import khóa học thành công",
    });
  } catch (error) {
    console.error("Lỗi khi import khóa học:", error);
    return NextResponse.json(
      { error: error.message || "Có lỗi xảy ra khi import khóa học" },
      { status: 500 }
    );
  }
}
