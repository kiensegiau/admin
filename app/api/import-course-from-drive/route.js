import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { PassThrough } from 'stream';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import axios from 'axios';

async function logFolderStructure(folderId, accessToken, indent = '') {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  });

  for (const item of res.data.files) {
    console.log(`${indent}${item.name} (${item.mimeType})`);
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      await logFolderStructure(item.id, accessToken, indent + '  ');
    }
  }
}

export async function POST(req) {
  const stream = new PassThrough();
  const encoder = new TextEncoder();

  const sendUpdate = (message) => {
    stream.write(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
  };

  const response = new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });

  let tempDir = '';
  try {
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('multipart/form-data')) {
      throw new Error('Invalid Content-Type. Expected multipart/form-data');
    }

    const formData = await req.formData();
    const { folderId, courseId } = Object.fromEntries(formData);
    console.log('Dữ liệu nhận được từ formData:', Object.fromEntries(formData));

    const accessToken = formData.get('accessToken') || req.cookies.get('googleDriveAccessToken')?.value;
    if (!accessToken) {
      throw new Error('Không có access token cho Google Drive');
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    console.log('Cấu trúc thư mục import:');
    await logFolderStructure(folderId, accessToken);

    // Tiếp tục xử lý import
    let actualCourseId;
    let folderName;
    if (courseId === 'new') {
      const folderInfo = await drive.files.get({ fileId: folderId, fields: 'name' });
      const newCourse = await createNewCourse(folderInfo.data.name);
      actualCourseId = newCourse.id;
      folderName = folderInfo.data.name;
      sendUpdate({ step: `Đã tạo khóa học mới với ID: ${actualCourseId} và tên: ${newCourse.name}`, progress: 10 });
    } else {
      actualCourseId = courseId;
      const folderInfo = await drive.files.get({ fileId: folderId, fields: 'name' });
      folderName = folderInfo.data.name;
      sendUpdate({ step: 'Đã lấy thông tin khóa học', progress: 10 });
    }
    await processFolder(folderId, 'course', actualCourseId, '', accessToken, sendUpdate, actualCourseId, folderName);

    sendUpdate({ message: 'Import hoàn tất' });
    stream.end();
    return response;

  } catch (error) {
    console.error('Lỗi chi tiết:', error);
    sendUpdate({ error: error.message });
    stream.end();
    return response;
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}

async function createNewCourse(name) {
  const courseRef = await addDoc(collection(db, 'courses'), {
    title: `${name} (copy)`,
    chapters: []
  });
  return { id: courseRef.id, name: `${name} (copy)` };
}

async function getCourse(courseId) {
  const courseDoc = await getDoc(doc(db, 'courses', courseId));
  if (!courseDoc.exists()) {
    throw new Error('Không tìm thấy khóa học');
  }
  return { id: courseDoc.id, ...courseDoc.data() };
}

async function createChapter(courseId, name) {
  const courseRef = doc(db, 'courses', courseId);
  const chapterId = uuidv4();
  await updateDoc(courseRef, {
    chapters: arrayUnion({ id: chapterId, title: name, lessons: [] })
  });
  return chapterId;
}

async function createLesson(courseId, chapterId, name) {
  const courseRef = doc(db, 'courses', courseId);
  const courseDoc = await getDoc(courseRef);
  const lessonId = uuidv4();
  const updatedChapters = courseDoc.data().chapters.map(chapter => {
    if (chapter.id === chapterId) {
      return {
        ...chapter,
        lessons: [...chapter.lessons, { id: lessonId, title: name, files: [] }]
      };
    }
    return chapter;
  });
  await updateDoc(courseRef, { chapters: updatedChapters });
  return { chapterId, lessonId };
}

async function addFileToLesson(courseId, chapterId, lessonId, file, accessToken, courseName, chapterName, lessonName) {
  console.log(`Bắt đầu thêm file: ${file.name} vào bài học: ${lessonName} (ID: ${lessonId})`);
  console.log('Bắt đầu tải file từ Google Drive');
  
  try {
    const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      responseType: 'arraybuffer',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    console.log('Kết thúc tải file từ Google Drive, kích thước:', response.data.byteLength);

    console.log('Đang chuẩn bị upload file');
    const formData = new FormData();
    formData.append("file", new Blob([response.data], { type: file.mimeType }), file.name);
    formData.append("courseName", courseName);
    formData.append("chapterName", chapterName);
    formData.append("lessonName", lessonName);
    formData.append("courseId", courseId);
    formData.append("chapterId", chapterId);
    formData.append("lessonId", lessonId);
    formData.append("fileName", file.name);
    formData.append("fileMimeType", file.mimeType);
    console.log('Đã tạo Blob từ file, kích thước:', formData.get("file").size);

    console.log('Gửi request upload');
    let uploadResponse;
    const headers = {
      'Content-Type': 'multipart/form-data',
      'Cookie': `googleDriveAccessToken=${accessToken}`
    };

    if (file.mimeType.startsWith('video/')) {
      uploadResponse = await axios.post('http://localhost:3000/api/upload-and-segment-video', formData, {
        headers: {
          ...headers,
          'Content-Type': 'multipart/form-data'
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    } else {
      uploadResponse = await axios.post('http://localhost:3000/api/upload-file', formData, {
        headers: headers,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
    }

    console.log('Upload hoàn thành');
    console.log(`Đã thêm file ${file.name} vào bài học ${lessonName}`);
    return uploadResponse.data;
  } catch (error) {
    console.error('Chi tiết lỗi khi upload:', error);
    throw new Error(`Lỗi khi upload file: ${error.message}`);
  }
}

async function processFolder(folderId, parentType, parentId, chapterName = '', accessToken, sendUpdate, courseId, courseName = '', lessonName = '') {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  });

  console.log(`Bắt đầu xử lý thư mục: ${folderId}, loại: ${parentType}`);
  console.log(`Số lượng file/thư mục con: ${res.data.files.length}`);

  for (const item of res.data.files) {
    console.log('Xử lý item:', item);
    console.log('parentType:', parentType);
    console.log('courseId:', courseId);
    console.log('parentId:', parentId);
    console.log('chapterName:', chapterName);
    console.log('accessToken:', accessToken);
    console.log('courseName:', courseName);

    if (item.mimeType === 'application/vnd.google-apps.folder') {
      if (parentType === 'course') {
        console.log('Tạo chương mới');
        const chapterId = await createChapter(courseId, item.name);
        console.log('chapterId mới:', chapterId);
        await processFolder(item.id, 'chapter', chapterId, item.name, accessToken, sendUpdate, courseId, courseName);
      } else if (parentType === 'chapter') {
        console.log('Tạo bài học mới');
        const { lessonId } = await createLesson(courseId, parentId, item.name);
        console.log('lessonId mới:', lessonId);
        await processFolder(item.id, 'lesson', lessonId, chapterName, accessToken, sendUpdate, courseId, courseName, item.name);
      }
    } else {
      if (parentType === 'lesson') {
        console.log('Thêm file vào bài học');
        await addFileToLesson(courseId, chapterName, parentId, item, accessToken, courseName, chapterName, lessonName);
        sendUpdate({ step: `Đã thêm file: ${item.name}`, progress: 70 });
      }
    }
  }
}