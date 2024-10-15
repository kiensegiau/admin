import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

export async function GET(req) {
  try {
    const accessToken = req.cookies.get('googleDriveAccessToken')?.value;
    const { searchParams } = new URL(req.url);
    const folderId = searchParams.get('folderId') || 'root';

    if (!accessToken) {
      return NextResponse.json({ error: 'Không có quyền truy cập Google Drive' }, { status: 401 });
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType)',
    });

    return NextResponse.json({ files: res.data.files });
  } catch (error) {
    console.error('Lỗi khi lấy cấu trúc thư mục:', error);
    return NextResponse.json({ error: 'Không thể lấy cấu trúc thư mục' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { folderId, courseId } = await req.json();
    const accessToken = req.cookies.get('googleDriveAccessToken')?.value;

    if (!accessToken) {
      return NextResponse.json({ error: 'Không có quyền truy cập Google Drive' }, { status: 401 });
    }

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

    return NextResponse.json({ success: true, message: 'Đã import khóa học thành công' });
  } catch (error) {
    console.error('Lỗi khi import khóa học:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function createChapter(courseId, chapterName) {
  const courseRef = doc(db, 'courses', courseId);
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