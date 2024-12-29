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
import { uploadToR2Direct } from "../../utils/r2DirectUpload";
import { segmentVideoMultipleResolutions } from "../../utils/videoProcessing";
import { uploadToR2MultiPart } from "../../utils/r2Upload";
import { uploadToDrive } from "../../utils/driveUpload";
import { refreshAccessToken } from '../../utils/auth';
import { encryptId } from '@/lib/encryption';

const getBandwidth = (resolution) => ({
  "480p": 1400000,
  "720p": 2800000,
  "1080p": 5000000,
}[resolution] || 1400000);

const getResolution = (resolution) => ({
  "480p": "854x480",
  "720p": "1280x720",
  "1080p": "1920x1080",
}[resolution] || "854x480");

function removeUndefined(obj) {
  Object.keys(obj).forEach((key) => {
    if (obj[key] && typeof obj[key] === "object") {
      removeUndefined(obj[key]);
    } else if (obj[key] === undefined) {
      delete obj[key];
    }
  });
  return obj;
}

async function createNewCourse(name) {
  const courseRef = await addDoc(collection(db, 'courses'), {
    title: `${name} (copy)`,
    chapters: []
  });
  return { id: courseRef.id, name: `${name} (copy)` };
}

async function checkAndRefreshToken(accessToken) {
  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    await oauth2Client.getTokenInfo(accessToken);
    return accessToken;
  } catch (error) {
    if (error.message === 'invalid_token') {
      const refreshToken = getCookie('googleDriveRefreshToken');
      if (refreshToken) {
        const newTokens = await refreshAccessToken(refreshToken);
        setCookie('googleDriveAccessToken', newTokens.access_token, { maxAge: newTokens.expires_in });
        return newTokens.access_token;
      }
    }
    throw error;
  }
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
}

function setCookie(name, value, options = {}) {
  let cookieString = `${name}=${value}`;
  if (options.maxAge) cookieString += `; Max-Age=${options.maxAge}`;
  if (options.path) cookieString += `; Path=${options.path}`;
  document.cookie = cookieString;
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
    const formData = await req.formData();
    const { folderId } = Object.fromEntries(formData);
    let accessToken = formData.get('accessToken') || req.cookies.get('googleDriveAccessToken')?.value;
    if (!accessToken) {
      throw new Error('Không có access token cho Google Drive');
    }

    accessToken = await checkAndRefreshToken(accessToken);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const folderInfo = await drive.files.get({ fileId: folderId, fields: 'name' });
    const newCourse = await createNewCourse(folderInfo.data.name);
    const actualCourseId = newCourse.id;
    sendUpdate({ step: `Đã tạo khóa học mới với ID: ${actualCourseId} và tên: ${newCourse.name}`, progress: 10 });

    await processFolder(folderId, 'course', actualCourseId, '', accessToken, sendUpdate, actualCourseId, newCourse.name);

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



async function createChapter(courseId, name) {
  const chapterId = uuidv4();
  const courseRef = doc(db, 'courses', courseId);
  await updateDoc(courseRef, {
    chapters: arrayUnion({ id: chapterId, title: name, lessons: [] })
  });
  console.log(`Đã tạo chapter mới: ${name} (ID: ${chapterId}) cho khóa học: ${courseId}`);
  return chapterId;
}

async function createLesson(courseId, chapterId, name) {
  const courseRef = doc(db, 'courses', courseId);
  const lessonId = uuidv4();
  const courseDoc = await getDoc(courseRef);
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
  console.log(`Đã tạo lesson mới: ${name} (ID: ${lessonId}) trong chapter: ${chapterId}`);
  return { chapterId, lessonId };
}

async function addFileToLesson(courseId, lessonId, file, accessToken, courseName, chapterName, lessonName) {
  console.log(`Bắt đầu thêm file: ${file.name} vào bài học: ${lessonName} (ID: ${lessonId})`);
  
  try {
    // Mã hóa Drive file ID
    const encryptedId = encryptId(file.id);
    
    // Generate proxy URL với encrypted ID
    const proxyUrl = `/api/proxy/files?id=${encryptedId}`;

    // Cập nhật Firebase
    const courseRef = doc(db, "courses", courseId);
    const courseDoc = await getDoc(courseRef);
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error("Không tìm thấy dữ liệu khóa học");
    }

    const fileData = {
      name: file.name,
      proxyUrl: proxyUrl,        // URL đã được mã hóa
      driveFileId: file.id,      // Vẫn giữ ID gốc để tracking
      type: file.mimeType,
      uploadTime: new Date().toISOString(),
    };

    let updatedChapters = JSON.parse(JSON.stringify(courseData.chapters));
    let chapterUpdated = false;

    for (let i = 0; i < updatedChapters.length; i++) {
      if (updatedChapters[i].title === chapterName) {
        for (let j = 0; j < updatedChapters[i].lessons.length; j++) {
          if (updatedChapters[i].lessons[j].title === lessonName) {
            if (!Array.isArray(updatedChapters[i].lessons[j].files)) {
              updatedChapters[i].lessons[j].files = [];
            }
            updatedChapters[i].lessons[j].files.push(fileData);
            chapterUpdated = true;
            break;
          }
        }
        if (chapterUpdated) break;
      }
    }

    if (!chapterUpdated) {
      console.log("Không tìm thấy chapter hoặc lesson. Dữ liệu hiện tại:", JSON.stringify(updatedChapters, null, 2));
      throw new Error("Không tìm thấy chapter hoặc lesson để cập nhật");
    }

    // Loại bỏ undefined values
    const cleanedData = removeUndefined({ chapters: updatedChapters });
    await updateDoc(courseRef, cleanedData);

    console.log(`Đã thêm file ${file.name} vào bài học ${lessonName}`);
    return {
      proxyUrl,
      driveFileId: file.id
    };

  } catch (error) {
    console.error('Chi tiết lỗi khi thêm file:', error);
    throw new Error(`Lỗi khi thêm file: ${error.message}`);
  }
}

async function processFolder(folderId, parentType, parentId, chapterName = '', accessToken, sendUpdate, courseId, courseName = '', lessonName = '') {
  accessToken = await checkAndRefreshToken(accessToken);
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType)',
  });

  for (const item of res.data.files) {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      if (parentType === 'course') {
        const chapterId = await createChapter(courseId, item.name);
        await processFolder(item.id, 'chapter', chapterId, item.name, accessToken, sendUpdate, courseId, courseName);
      } else if (parentType === 'chapter') {
        const { lessonId } = await createLesson(courseId, parentId, item.name);
        await processFolder(item.id, 'lesson', lessonId, chapterName, accessToken, sendUpdate, courseId, courseName, item.name);
      }
    } else if (parentType === 'lesson') {
      await addFileToLesson(courseId, parentId, item, accessToken, courseName, chapterName, lessonName);
      sendUpdate({ step: `Đã thêm file: ${item.name}`, progress: 70 });
    }
  }
}
