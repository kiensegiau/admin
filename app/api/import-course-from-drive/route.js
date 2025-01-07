import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { v4 as uuidv4 } from "uuid";
import { readTokens } from "@/lib/tokenStorage";
import { initializeDriveClient, getFolderInfo, listFolderContents } from "@/app/utils/serverDriveUtils";

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
      teacher: "",
      subject: "",
      grade: "",
      price: 0,
      description: ""
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
    const courseDoc = await courseRef.get();
    const courseData = courseDoc.data();

    const newChapter = {
      id: chapterId,
      title: name,
      lessons: [],
      order: (courseData.chapters?.length || 0) + 1
    };

    await courseRef.update({
      chapters: [...(courseData.chapters || []), newChapter],
      updatedAt: new Date().toISOString()
    });

    console.log(`Đã tạo chapter mới: ${name} (ID: ${chapterId}) cho khóa học: ${courseId}`);
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

    const newLesson = {
      id: lessonId,
      title: name,
      files: [],
      order: 1
    };

    const updatedChapters = courseData.chapters.map(chapter => {
      if (chapter.id === chapterId) {
        return {
          ...chapter,
          lessons: [...(chapter.lessons || []), newLesson]
        };
      }
      return chapter;
    });

    await courseRef.update({
      chapters: updatedChapters,
      updatedAt: new Date().toISOString()
    });

    console.log(`Đã tạo lesson mới: ${name} (ID: ${lessonId}) trong chapter: ${chapterId}`);
    return { lessonId, chapterId };
  } catch (error) {
    console.error("Lỗi khi tạo lesson:", error);
    throw new Error("Không thể tạo lesson: " + error.message);
  }
}

async function addFileToLesson(courseId, chapterId, lessonId, file) {
  try {
    const fileData = {
      name: file.name,
      type: getFileType(file.mimeType),
      mimeType: file.mimeType,
      size: file.size,
      uploadTime: new Date().toISOString()
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
      updatedAt: new Date().toISOString()
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
    console.log(`\n=== Bắt đầu xử lý thư mục ===`);
    console.log(`ParentType: ${parentType}`);
    console.log(`CourseId: ${courseId}`);
    console.log(`ParentId: ${parentId}`);
    console.log(`LessonId: ${lessonId}`);

    const files = await listFolderContents(drive, folderId);
    console.log(`\nDanh sách files trong thư mục:`, files);

    const folders = files.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const documents = files.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

    console.log(`\nSố lượng thư mục con: ${folders.length}`);
    console.log(`Số lượng tài liệu: ${documents.length}`);

    // Xử lý các thư mục (chapters hoặc lessons)
    for (const folder of folders) {
      console.log(`\n-> Xử lý thư mục: ${folder.name}`);
      if (parentType === 'course') {
        console.log(`Tạo chapter mới: ${folder.name}`);
        const chapterId = await createChapter(courseId, folder.name);
        console.log(`Đã tạo chapter với ID: ${chapterId}`);
        await processFolder(drive, folder.id, courseId, 'chapter', chapterId);
      } 
      else if (parentType === 'chapter') {
        console.log(`Tạo lesson mới trong chapter: ${folder.name}`);
        const { lessonId: newLessonId } = await createLesson(courseId, parentId, folder.name);
        console.log(`Đã tạo lesson với ID: ${newLessonId}`);
        await processFolder(drive, folder.id, courseId, 'lesson', parentId, newLessonId);
      }
    }

    // Xử lý các file trong lesson
    if (parentType === 'lesson' && lessonId) {
      console.log(`\n-> Xử lý files trong lesson ${lessonId}:`);
      for (const file of documents) {
        console.log(`Xử lý file: ${file.name}`);
        const fileType = getFileType(file.mimeType);
        if (fileType !== 'other') {
          console.log(`Thêm file ${file.name} vào lesson`);
          await addFileToLesson(courseId, parentId, lessonId, file);
        } else {
          console.warn(`Bỏ qua file không được hỗ trợ: ${file.name}`);
        }
      }
    }

    console.log(`=== Kết thúc xử lý thư mục ===\n`);
  } catch (error) {
    console.error('Lỗi khi xử lý thư mục:', error);
    throw error;
  }
}

export async function POST(request) {
  try {
    console.log('\n=== Bắt đầu import khóa học ===');
    const { driveUrl } = await request.json();
    console.log('URL Drive:', driveUrl);

    const folderId = extractDriveId(driveUrl);
    console.log('Folder ID:', folderId);

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
    console.log('Đã lấy được access token');

    // Khởi tạo Drive API
    const drive = await initializeDriveClient(tokens.access_token);
    console.log('Đã khởi tạo Drive API');

    // Lấy thông tin thư mục gốc
    const folderInfo = await getFolderInfo(drive, folderId);
    console.log('Thông tin thư mục gốc:', folderInfo.data);

    // Tạo khóa học mới
    const newCourse = await createNewCourse(folderInfo.data.name);
    console.log('Đã tạo khóa học mới:', newCourse);

    // Xử lý cấu trúc thư mục
    await processFolder(drive, folderId, newCourse.id);

    console.log('=== Kết thúc import khóa học ===\n');

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
