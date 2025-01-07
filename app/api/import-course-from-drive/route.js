import { NextResponse } from "next/server";
import { google } from "googleapis";
import { adminDb } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { readTokens } from "@/lib/tokenStorage";
import { encryptId } from "@/lib/encryption";

// Khởi tạo Google Drive API client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

// Hàm lấy ID từ Google Drive URL
function extractDriveId(url) {
  const patterns = [
    /\/folders\/([a-zA-Z0-9-_]+)/,  // Format: folders/id
    /\/d\/([a-zA-Z0-9-_]+)/,        // Format: d/id
    /id=([a-zA-Z0-9-_]+)/,          // Format: id=id
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function createNewCourse(name) {
  try {
    const courseRef = await adminDb.collection("courses").add({
      title: name,
      chapters: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    console.log("Đã tạo khóa học mới:", courseRef.id);
    return { id: courseRef.id, name };
  } catch (error) {
    console.error("Lỗi khi tạo khóa học:", error);
    throw new Error("Không thể tạo khóa học mới: " + error.message);
  }
}

async function createChapter(courseId, name) {
  try {
    const chapterId = uuidv4();
    const courseRef = adminDb.collection("courses").doc(courseId);
    await courseRef.update({
      chapters: [...(await courseRef.get()).data().chapters, { id: chapterId, title: name, lessons: [] }]
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
    const lessonId = uuidv4();
    const courseRef = adminDb.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();
    const courseData = courseDoc.data();

    const updatedChapters = courseData.chapters.map((chapter) => {
      if (chapter.id === chapterId) {
        return {
          ...chapter,
          lessons: [...(chapter.lessons || []), { id: lessonId, title: name, files: [] }],
        };
      }
      return chapter;
    });

    await courseRef.update({ chapters: updatedChapters });
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
    const encryptedId = encryptId(file.id);
    const fileType = getFileType(file.mimeType);
    
    const fileData = {
      name: file.name,
      originalName: file.name,
      proxyUrl: `/api/proxy/files?id=${encryptedId}`,
      driveFileId: encryptedId,
      type: fileType,
      mimeType: file.mimeType,
      size: file.size,
      uploadTime: new Date().toISOString(),
      accessControl: {
        requiresAuth: true,
        allowedRoles: ['student', 'teacher', 'admin'],
        expiryTime: null
      }
    };

    const courseRef = adminDb.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error("Không tìm thấy dữ liệu khóa học");
    }

    const updatedChapters = courseData.chapters.map(chapter => {
      if (chapter.id === chapterId) {
        const updatedLessons = chapter.lessons.map(lesson => {
          if (lesson.id === lessonId) {
            return {
              ...lesson,
              files: [...(lesson.files || []), fileData]
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
      hasEncryptedFiles: true
    });

    console.log(`Đã thêm và mã hóa file ${file.name} vào lesson ${lessonId}`);
    return fileData;
  } catch (error) {
    console.error("Lỗi khi thêm file:", error);
    throw error;
  }
}

// Hàm xác định loại file
function getFileType(mimeType) {
  const videoTypes = ['video/mp4', 'video/webm', 'video/ogg'];
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif'];

  if (videoTypes.includes(mimeType)) return 'video';
  if (documentTypes.includes(mimeType)) return 'document';
  if (imageTypes.includes(mimeType)) return 'image';
  return 'other';
}

async function processFolder(drive, folderId, courseId, parentType = 'course', parentId = null, lessonId = null) {
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, size)',
      orderBy: 'name',
    });

    const files = res.data.files;
    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const documents = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    // Xử lý các thư mục (chapters hoặc lessons)
    for (const folder of folders) {
      if (parentType === 'course') {
        const chapterId = await createChapter(courseId, folder.name);
        await processFolder(drive, folder.id, courseId, 'chapter', chapterId);
      } 
      else if (parentType === 'chapter') {
        const { lessonId: newLessonId } = await createLesson(courseId, parentId, folder.name);
        await processFolder(drive, folder.id, courseId, 'lesson', parentId, newLessonId);
      }
    }

    // Xử lý các file trong lesson
    if (parentType === 'lesson' && lessonId) {
      for (const file of documents) {
        // Kiểm tra loại file trước khi thêm
        const fileType = getFileType(file.mimeType);
        if (fileType !== 'other') { // Chỉ thêm các file được hỗ trợ
          await addFileToLesson(courseId, parentId, lessonId, file);
        } else {
          console.warn(`Bỏ qua file không được hỗ trợ: ${file.name}`);
        }
      }
    }

  } catch (error) {
    console.error('Lỗi khi xử lý thư mục:', error);
    throw error;
  }
}

export async function POST(request) {
  try {
    const { driveUrl } = await request.json();
    const folderId = extractDriveId(driveUrl);

    if (!folderId) {
      return NextResponse.json(
        { error: 'URL Google Drive không hợp lệ' },
        { status: 400 }
      );
    }

    // Lấy access token
    const tokens = readTokens();
    if (!tokens?.access_token) {
      throw new Error("Không tìm thấy access token");
    }

    // Khởi tạo Drive API
    oauth2Client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Lấy thông tin thư mục gốc
    const folderInfo = await drive.files.get({
      fileId: folderId,
      fields: 'name',
    });

    // Tạo khóa học mới
    const newCourse = await createNewCourse(folderInfo.data.name);

    // Xử lý cấu trúc thư mục
    await processFolder(drive, folderId, newCourse.id);

    return NextResponse.json({
      success: true,
      courseId: newCourse.id,
      message: 'Import khóa học thành công'
    });

  } catch (error) {
    console.error('Lỗi khi import khóa học:', error);
    return NextResponse.json(
      { error: error.message || 'Có lỗi xảy ra khi import khóa học' },
      { status: 500 }
    );
  }
}
