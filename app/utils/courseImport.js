import { ObjectId, findOneDocument, updateDocument } from '@/lib/db';
import { google } from 'googleapis';

export async function importCourseFromDrive(folderId, courseId, accessToken) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  async function processFolder(folderId, parentType, parentId) {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
    });
    
    for (const item of res.data.files) {
      if (item.mimeType === 'application/vnd.google-apps.folder') {
        if (parentType === 'course') {
          const chapterId = await createChapter(courseId, item.name);
          await processFolder(item.id, 'chapter', chapterId);
        } else if (parentType === 'chapter') {
          const lessonId = await createLesson(courseId, parentId, item.name);
          await processFolder(item.id, 'lesson', lessonId);
        }
      } else {
        if (parentType === 'lesson') {
          await addFileToLesson(courseId, parentId, item);
        }
      }
    }
  }

  await processFolder(folderId, 'course', courseId);
}

async function createChapter(courseId, chapterName) {
  const courseData = await findOneDocument('courses', { _id: new ObjectId(courseId) });
  if (!courseData) {
    throw new Error(`Không tìm thấy khóa học với ID: ${courseId}`);
  }
  
  const newChapter = {
    id: Date.now().toString(),
    title: chapterName,
    lessons: []
  };

  await updateDocument('courses', 
    { _id: new ObjectId(courseId) },
    { $push: { chapters: newChapter } }
  );

  return newChapter.id;
}

async function createLesson(courseId, chapterId, lessonName) {
  const courseData = await findOneDocument('courses', { _id: new ObjectId(courseId) });
  if (!courseData) {
    throw new Error(`Không tìm thấy khóa học với ID: ${courseId}`);
  }

  const newLesson = {
    id: Date.now().toString(),
    title: lessonName,
    files: []
  };

  const updatedChapters = courseData.chapters.map(chapter => {
    if (chapter.id === chapterId) {
      return {
        ...chapter,
        lessons: [...chapter.lessons, newLesson]
      };
    }
    return chapter;
  });

  await updateDocument('courses', 
    { _id: new ObjectId(courseId) },
    { $set: { chapters: updatedChapters } }
  );

  return newLesson.id;
}

async function addFileToLesson(courseId, lessonId, file) {
  const courseData = await findOneDocument('courses', { _id: new ObjectId(courseId) });
  if (!courseData) {
    throw new Error(`Không tìm thấy khóa học với ID: ${courseId}`);
  }

  // Tìm chapter chứa lesson cần cập nhật
  let chapterId = null;
  let targetChapterIndex = -1;
  let targetLessonIndex = -1;

  courseData.chapters.forEach((chapter, chapterIndex) => {
    chapter.lessons.forEach((lesson, lessonIndex) => {
      if (lesson.id === lessonId) {
        chapterId = chapter.id;
        targetChapterIndex = chapterIndex;
        targetLessonIndex = lessonIndex;
      }
    });
  });

  if (targetChapterIndex === -1 || targetLessonIndex === -1) {
    throw new Error(`Không tìm thấy lesson với ID: ${lessonId}`);
  }

  // Tạo nested path cho việc cập nhật
  const updatePath = `chapters.${targetChapterIndex}.lessons.${targetLessonIndex}.files`;
  
  // Tạo file mới để thêm vào
  const newFile = {
    name: file.name,
    driveFileId: file.id,
    type: file.mimeType
  };

  // Cập nhật file vào lesson
  await updateDocument('courses', 
    { _id: new ObjectId(courseId) },
    { $push: { [updatePath]: newFile } }
  );
}