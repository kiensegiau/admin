import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
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
  const courseRef = doc(db, 'courses', courseId);
  const courseDoc = await getDoc(courseRef);
  const courseData = courseDoc.data();
  
  const newChapter = {
    id: Date.now().toString(),
    title: chapterName,
    lessons: []
  };

  await updateDoc(courseRef, {
    chapters: arrayUnion(newChapter)
  });

  return newChapter.id;
}

async function createLesson(courseId, chapterId, lessonName) {
  const courseRef = doc(db, 'courses', courseId);
  const courseDoc = await getDoc(courseRef);
  const courseData = courseDoc.data();

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

  await updateDoc(courseRef, { chapters: updatedChapters });

  return newLesson.id;
}

async function addFileToLesson(courseId, lessonId, file) {
  const courseRef = doc(db, 'courses', courseId);
  const courseDoc = await getDoc(courseRef);
  const courseData = courseDoc.data();

  const updatedChapters = courseData.chapters.map(chapter => ({
    ...chapter,
    lessons: chapter.lessons.map(lesson => {
      if (lesson.id === lessonId) {
        return {
          ...lesson,
          files: [...lesson.files, {
            name: file.name,
            driveFileId: file.id,
            type: file.mimeType
          }]
        };
      }
      return lesson;
    })
  }));

  await updateDoc(courseRef, { chapters: updatedChapters });
}