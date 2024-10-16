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

async function createNewCourse(name) {
  const courseRef = await addDoc(collection(db, 'courses'), {
    title: `${name} (copy)`,
    chapters: []
  });
  return { id: courseRef.id, name: `${name} (copy)` };
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
    const accessToken = formData.get('accessToken') || req.cookies.get('googleDriveAccessToken')?.value;
    if (!accessToken) {
      throw new Error('Không có access token cho Google Drive');
    }

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

async function getCourse(courseId) {
  const courseDoc = await getDoc(doc(db, 'courses', courseId));
  if (!courseDoc.exists()) {
    throw new Error('Không tìm thấy khóa học');
  }
  return { id: courseDoc.id, ...courseDoc.data() };
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
  console.log(`CourseId: ${courseId}, ChapterName: ${chapterName}, LessonName: ${lessonName}`);
  
  let tempDir = "";
  try {
    console.log('Bắt đầu tải file từ Google Drive');
    const response = await axios.get(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      responseType: 'arraybuffer',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });
    console.log('Kết thúc tải file từ Google Drive, kích thước:', response.data.byteLength);

    tempDir = path.join(os.tmpdir(), uuidv4());
    await fs.mkdir(tempDir, { recursive: true });
    const inputPath = path.join(tempDir, file.name);
    await fs.writeFile(inputPath, Buffer.from(response.data));

    // Upload to Google Drive
    const drivePath = `khoa-hoc/${courseName}/${chapterName}/${lessonName}`;
    const driveResult = await uploadToDrive(
      new File([response.data], file.name, { type: file.mimeType }),
      accessToken,
      (progress) => {
        console.log(`Tiến trình tải lên Drive: ${progress}%`);
      },
      drivePath
    );

    if (file.mimeType.startsWith('video/')) {
      // Xử lý video
      const outputDir = path.join(tempDir, "output");
      await fs.mkdir(outputDir, { recursive: true });

      const outputPaths = await segmentVideoMultipleResolutions(inputPath, outputDir);

      const baseKey = `khoa-hoc/${courseName}/${chapterName}/${lessonName}`;
      const resolutionUploads = await Promise.all(
        outputPaths.map(async (outputPath) => {
          const resolution = path.basename(path.dirname(outputPath));
          const playlist = await fs.readFile(outputPath, "utf8");
          const segments = await fs.readdir(path.dirname(outputPath));
          const tsSegments = segments.filter((file) => file.endsWith(".ts"));

          await Promise.all(
            tsSegments.map(async (segment) => {
              const segmentPath = path.join(path.dirname(outputPath), segment);
              const segmentContent = await fs.readFile(segmentPath);
              const segmentKey = `${baseKey}/${resolution}/${segment}`;
              return uploadToR2MultiPart(
                segmentContent,
                segmentKey,
                courseName,
                chapterName,
                lessonName
              );
            })
          );

          const updatedPlaylistContent = playlist
            .split("\n")
            .map((line) => {
              if (!line.startsWith("#") && line.trim() !== "") {
                const segmentName = line.trim();
                if (tsSegments.includes(segmentName)) {
                  const segmentKey = `${baseKey}/${resolution}/${segmentName}`;
                  return `/api/r2-proxy?key=${encodeURIComponent(segmentKey)}`;
                }
              }
              return line;
            })
            .join("\n");

          const playlistKey = `${baseKey}/${resolution}/playlist.m3u8`;
          const playlistFile = new File([updatedPlaylistContent], playlistKey, {
            type: "application/x-mpegURL",
          });
          const { downloadUrl: playlistUrl } = await uploadToR2Direct(
            playlistFile,
            courseName,
            chapterName,
            lessonName
          );

          return { resolution, playlistUrl };
        })
      );

      const masterPlaylistContent = resolutionUploads
        .map(({ resolution, playlistUrl }) => {
          const encodedKey = encodeURIComponent(
            `${baseKey}/${resolution}/playlist.m3u8`
          );
          return `#EXT-X-STREAM-INF:BANDWIDTH=${getBandwidth(
            resolution
          )},RESOLUTION=${getResolution(
            resolution
          )}\n/api/r2-proxy?key=${encodedKey}`;
        })
        .join("\n");

      const masterPlaylistKey = `/master.m3u8`;
      const masterPlaylistFile = new File(
        [masterPlaylistContent],
        masterPlaylistKey,
        { type: "application/x-mpegURL" }
      );
      const { downloadUrl: masterPlaylistUrl } = await uploadToR2Direct(
        masterPlaylistFile,
        courseName,
        chapterName,
        lessonName
      );

      // Khi cập nhật Firebase, tìm chapter và lesson dựa trên tên thay vì ID
      const courseRef = doc(db, "courses", courseId);
      const courseDoc = await getDoc(courseRef);
      const courseData = courseDoc.data();

      if (!courseData) {
        throw new Error("Không tìm thấy dữ liệu khóa học");
      }

      const fileData = {
        name: file.name,
        r2FileId: `/api/r2-proxy?key=${encodeURIComponent(masterPlaylistKey)}`,
        driveFileId: driveResult.fileId,
        driveUrl: driveResult.webViewLink,
        type: "application/vnd.apple.mpegurl",
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
        console.log("ChapterName cần tìm:", chapterName);
        console.log("LessonName cần tìm:", lessonName);
        throw new Error("Không tìm thấy chapter hoặc lesson để cập nhật");
      }

      // Loại bỏ các giá trị undefined
      const cleanedData = removeUndefined({ chapters: updatedChapters });

      // Log dữ liệu trước khi cập nhật
      console.log(
        "Dữ liệu cập nhật (đã làm sạch):",
        JSON.stringify(cleanedData, null, 2)
      );

      await updateDoc(courseRef, cleanedData);

      console.log(`Đã thêm file ${file.name} vào bài học ${lessonName}`);
      return {
        masterPlaylistKey,
        masterPlaylistUrl,
        driveFileId: driveResult.fileId,
        driveWebViewLink: driveResult.webViewLink,
      };
    } else {
      // Xử lý các loại file khác (không phải video)
      const { downloadUrl: r2Url } = await uploadToR2Direct(
        new File([response.data], file.name, { type: file.mimeType }),
        courseName,
        chapterName,
        lessonName
      );

      // Khi cập nhật Firebase, tìm chapter và lesson dựa trên tên thay vì ID
      const courseRef = doc(db, "courses", courseId);
      const courseDoc = await getDoc(courseRef);
      const courseData = courseDoc.data();

      if (!courseData) {
        throw new Error("Không tìm thấy dữ liệu khóa học");
      }

      const fileData = {
        name: file.name,
        r2FileId: r2Url,
        driveFileId: driveResult.fileId,
        driveUrl: driveResult.webViewLink,
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
        console.log("ChapterName cần tìm:", chapterName);
        console.log("LessonName cần tìm:", lessonName);
        throw new Error("Không tìm thấy chapter hoặc lesson để cập nhật");
      }

      // Loại bỏ các giá trị undefined
      const cleanedData = removeUndefined({ chapters: updatedChapters });

      // Log dữ liệu trước khi cập nhật
      console.log(
        "Dữ liệu cập nhật (đã làm sạch):",
        JSON.stringify(cleanedData, null, 2)
      );

      await updateDoc(courseRef, cleanedData);

      console.log(`Đã thêm file ${file.name} vào bài học ${lessonName}`);
      return {
        r2FileId: r2Url,
        driveFileId: driveResult.fileId,
        driveWebViewLink: driveResult.webViewLink,
      };
    }
  } catch (error) {
    console.error('Chi tiết lỗi khi upload:', error);
    throw new Error(`Lỗi khi upload file: ${error.message}`);
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
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
