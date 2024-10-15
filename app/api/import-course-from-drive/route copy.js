import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc, arrayUnion, addDoc, collection } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { PassThrough } from 'stream';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { cookies } from 'next/headers';

async function logFolderStructure(folderId, accessToken, indent = '') {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  });

  let structure = '';
  for (const item of res.data.files) {
    structure += `${indent}${item.name} (${item.mimeType})\n`;
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      structure += await logFolderStructure(item.id, accessToken, indent + '  ');
    }
  }
  return structure;
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
    console.log('Dữ liệu nhận được từ formData:', { folderId, courseId });

    let accessToken = req.cookies.get('googleDriveAccessToken')?.value;
    const refreshToken = req.cookies.get('googleDriveRefreshToken')?.value;

    if (!accessToken) {
      console.log('Không tìm thấy access token');
      throw new Error('Không có access token cho Google Drive');
    }

    console.log('Tìm thấy access token:', accessToken.substring(0, 20) + '...');

    accessToken = await verifyAndRefreshToken(accessToken, refreshToken);

    sendUpdate({ step: 'Bắt đầu import khóa học', progress: 0 });

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    let course;
    if (courseId === 'new') {
      const folderInfo = await drive.files.get({ fileId: folderId, fields: 'name' });
      course = await createNewCourse(folderInfo.data.name);
      sendUpdate({ step: 'Đã tạo khóa học mới', progress: 10 });
    } else {
      course = await getCourse(courseId);
      sendUpdate({ step: 'Đã lấy thông tin khóa học', progress: 10 });
    }

    async function processFolder(folderId, parentType, parentId, chapterName = '', currentAccessToken) {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
      });
      
      console.log(`Bắt đầu xử lý thư mục: ${folderId}, loại: ${parentType}`);
      console.log(`Số lượng file/thư mục con: ${res.data.files.length}`);
      
      for (const item of res.data.files) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          if (parentType === 'course') {
            const chapterId = await createChapter(course.id, item.name);
            sendUpdate({ step: `Đã tạo chương: ${item.name}`, progress: 30 });
            await processFolder(item.id, 'chapter', chapterId, item.name, currentAccessToken);
          } else if (parentType === 'chapter') {
            const { lessonId } = await createLesson(course.id, parentId, item.name);
            sendUpdate({ step: `Đã tạo bài học: ${item.name}`, progress: 50 });
            await processFolder(item.id, 'lesson', lessonId, chapterName, currentAccessToken);
          }
        } else {
          if (parentType === 'lesson') {
            await addFileToLesson(course.id, parentId, item.id, currentAccessToken, course.name, chapterName, item.name, refreshToken);
            sendUpdate({ step: `Đã thêm file: ${item.name}`, progress: 70 });
          }
        }
      }
      console.log(`Hoàn thành xử lý thư mục: ${folderId}`);
    }

    await processFolder(folderId, 'course', course.id, '', accessToken);
    sendUpdate({ step: 'Hoàn thành import khóa học', progress: 100 });

    stream.end();
    return response;
  } catch (error) {
    console.error('Chi tiết lỗi khi import:', error);
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
  console.log(`Bắt đầu tạo khóa học mới: ${name}`);
  const courseName = `${name} (copy)`;
  const courseRef = await addDoc(collection(db, 'courses'), {
    title: courseName,
    chapters: []
  });
  console.log(`Đã tạo khóa học mới với ID: ${courseRef.id}`);
  return { id: courseRef.id, name: courseName };
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

async function addFileToLesson(courseId, chapterId, lessonId, fileId, accessToken, courseName, chapterName, lessonName, refreshToken) {
  console.log(`Bắt đầu thêm file: ${fileId} vào bài học: ${lessonId}`);
  console.log('Bắt đầu tải file từ Google Drive');

  async function getFileWithToken(token) {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: token });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    try {
      const file = await drive.files.get({ fileId: fileId, fields: 'name, mimeType' });
      console.log(`Thông tin file: ${file.data.name}, loại: ${file.data.mimeType}`);
      
      const fileStream = await drive.files.get(
        { fileId: fileId, alt: 'media' },
        { responseType: 'stream' }
      );
      
      const chunks = [];
      for await (const chunk of fileStream.data) {
        chunks.push(chunk);
      }
      const fileContent = Buffer.concat(chunks);
      
      console.log('Kết thúc tải file từ Google Drive, kích thước:', fileContent.length);
      return { file: file.data, fileContent };
    } catch (error) {
      console.error('Lỗi khi tải file:', error);
      throw error;
    }
  }

  let fileData;
  try {
    fileData = await getFileWithToken(accessToken);
  } catch (error) {
    console.log('Lỗi khi tải file, đang thử làm mới token...');
    if (refreshToken) {
      const newToken = await refreshAccessToken(refreshToken);
      if (newToken) {
        console.log('Đã làm mới token, thử lại...');
        accessToken = newToken;
        try {
          fileData = await getFileWithToken(newToken);
        } catch (retryError) {
          console.error('Lỗi sau khi làm mới token:', retryError);
          throw new Error(`Lỗi khi tải file sau khi làm mới token: ${retryError.message}`);
        }
      } else {
        throw new Error('Không thể làm mới token. Vui lòng đăng nhập lại.');
      }
    } else {
      console.error('Lỗi khi tải file và không có refresh token:', error);
      throw new Error(`Lỗi khi tải file: ${error.message}`);
    }
  }

  console.log('Đang chuẩn bị upload file');
  const formData = new FormData();
  formData.append("file", new Blob([fileData.fileContent], { type: fileData.file.mimeType }), fileData.file.name);
  formData.append("courseName", courseName);
  formData.append("chapterName", chapterName);
  formData.append("lessonName", lessonName);
  formData.append("courseId", courseId);
  formData.append("chapterId", chapterId);
  formData.append("lessonId", lessonId);
  console.log('Đã tạo Blob từ file, kích thước:', formData.get("file").size);
  console.log(`Đã chuẩn bị xong formData cho upload`);

  console.log('Gửi request upload');
  let response;
  try {
    if (fileData.file.mimeType.startsWith('video/')) {
      response = await fetch('http://localhost:3000/api/upload-and-segment-video', {
        method: 'POST',
        body: formData
      });
    } else {
      response = await fetch('http://localhost:3000/api/upload-file', {
        method: 'POST',
        body: formData
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lỗi khi upload file: ${response.statusText}. Chi tiết: ${errorText}`);
    }

    console.log('Upload hoàn thành');
  } catch (error) {
    console.error('Chi tiết lỗi khi upload:', error);
    throw new Error(`Lỗi khi upload file: ${error.message}`);
  }
  console.log(`Hoàn thành thêm file vào bài học`);
}

async function refreshAccessToken(refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials.access_token;
  } catch (error) {
    console.error('Lỗi khi làm mới token:', error);
    return null;
  }
}

async function verifyAndRefreshToken(accessToken, refreshToken) {
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    await google.drive({ version: 'v3', auth: oauth2Client }).files.list({ pageSize: 1 });
    return accessToken;
  } catch (error) {
    console.log('Token không hợp lệ, đang làm mới...');
    if (refreshToken) {
      const newToken = await refreshAccessToken(refreshToken);
      if (newToken) {
        console.log('Đã làm mới token thành công');
        return newToken;
      }
    }
    throw new Error('Không thể xác thực hoặc làm mới token. Vui lòng đăng nhập lại.');
  }
}