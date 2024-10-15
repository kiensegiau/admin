import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { uploadToR2Direct } from "../../utils/r2DirectUpload";
import { segmentVideoMultipleResolutions } from "../../utils/videoProcessing";
import os from 'os';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { uploadToR2MultiPart } from '../../utils/r2Upload';
import { uploadToDrive } from '../../utils/driveUpload';
import { PassThrough } from 'stream';
import busboy from 'busboy';

// Tối ưu hóa hàm getBandwidth và getResolution bằng cách sử dụng object literals
const getBandwidth = resolution => ({
  '480p': 1400000, '720p': 2800000, '1080p': 5000000
}[resolution] || 1400000);

const getResolution = resolution => ({
  '480p': '854x480', '720p': '1280x720', '1080p': '1920x1080'
}[resolution] || '854x480');

export const config = {
  api: {
    bodyParser: false,
  },
};

export async function GET(req) {
  const stream = new PassThrough();
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}

// Thêm hàm này vào đầu file hoặc trong một file utility riêng
function removeUndefined(obj) {
  Object.keys(obj).forEach(key => {
    if (obj[key] && typeof obj[key] === 'object') {
      removeUndefined(obj[key]);
    } else if (obj[key] === undefined) {
      delete obj[key];
    }
  });
  return obj;
}

export async function POST(req) {
  console.log('=== Bắt đầu xử lý request POST ===');
  const stream = new PassThrough();
  const encoder = new TextEncoder();

  const sendUpdate = (message) => {
    stream.write(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
    console.log('Gửi cập nhật:', message);
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
    console.log('Trước khi parse FormData');
    const formData = await parseFormData(req);
    console.log('Sau khi parse FormData:', formData);

    const file = formData.file;
    const courseName = formData.courseName;
    const chapterName = formData.chapterName;
    const lessonName = formData.lessonName;
    const courseId = formData.courseId;
    const chapterId = formData.chapterId;
    const lessonId = formData.lessonId;

    console.log('Dữ liệu nhận được:', { 
      courseName, 
      chapterName, 
      lessonName, 
      courseId, 
      chapterId, 
      lessonId,
      file: file ? { filename: file.filename, size: file.size } : 'Không có file'
    });

    if (!file || !courseId || !chapterId || !lessonId) {
      console.error('Thiếu các trường bắt buộc');
      return NextResponse.json({ error: "Thiếu các trường bắt buộc" }, { status: 400 });
    }

    console.log('File nhận được:', file.filename, 'Size:', file.size);

    tempDir = path.join(os.tmpdir(), uuidv4());
    await fs.mkdir(tempDir, { recursive: true });
    const inputPath = path.join(tempDir, file.name);
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    // Upload to Google Drive
    const accessToken = req.cookies.get('googleDriveAccessToken')?.value;
    if (!accessToken) {
      throw new Error('Không có access token cho Google Drive');
    }
    const drivePath = `khoa-hoc/${courseName}/${chapterName}/${lessonName}`;
    const driveResult = await uploadToDrive(file, accessToken, () => {}, drivePath);

    // Segment video and upload to R2
    const outputDir = path.join(tempDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const outputPaths = await segmentVideoMultipleResolutions(inputPath, outputDir);

    const baseKey = `khoa-hoc/${courseName}/${chapterName}/${lessonName}`;
    const resolutionUploads = await Promise.all(outputPaths.map(async (outputPath) => {
      const resolution = path.basename(path.dirname(outputPath));
      const playlist = await fs.readFile(outputPath, 'utf8');
      const segments = await fs.readdir(path.dirname(outputPath));
      const tsSegments = segments.filter(file => file.endsWith('.ts'));

      await Promise.all(tsSegments.map(async (segment) => {
        const segmentPath = path.join(path.dirname(outputPath), segment);
        const segmentContent = await fs.readFile(segmentPath);
        const segmentKey = `${baseKey}/${resolution}/${segment}`;
        return uploadToR2MultiPart(segmentContent, segmentKey, courseName, chapterName, lessonName);
      }));


      const updatedPlaylistContent = playlist.split('\n').map(line => {
        if (!line.startsWith('#') && line.trim() !== '') {
          const segmentName = line.trim();
          if (tsSegments.includes(segmentName)) {
            const segmentKey = `${baseKey}/${resolution}/${segmentName}`;
            return `/api/r2-proxy?key=${encodeURIComponent(segmentKey)}`;
          }
        }
        return line;
      }).join('\n');

      const playlistKey = `${baseKey}/${resolution}/playlist.m3u8`;
      const playlistFile = new File([updatedPlaylistContent], playlistKey, { type: 'application/x-mpegURL' });
      const { downloadUrl: playlistUrl } = await uploadToR2Direct(playlistFile, courseName, chapterName, lessonName);

      return { resolution, playlistUrl };
    }));


    const masterPlaylistContent = resolutionUploads.map(({ resolution, playlistUrl }) => {
      const encodedKey = encodeURIComponent(`${baseKey}/${resolution}/playlist.m3u8`);
      return `#EXT-X-STREAM-INF:BANDWIDTH=${getBandwidth(resolution)},RESOLUTION=${getResolution(resolution)}\n/api/r2-proxy?key=${encodedKey}`;
    }).join('\n');

    const masterPlaylistKey = `${baseKey}/master.m3u8`;
    const masterPlaylistFile = new File([masterPlaylistContent], masterPlaylistKey, { type: 'application/x-mpegURL' });
    const { downloadUrl: masterPlaylistUrl } = await uploadToR2Direct(masterPlaylistFile, courseName, chapterName, lessonName);

    // Cập nhật Firebase
    const courseRef = doc(db, 'courses', courseId);
    const courseDoc = await getDoc(courseRef);
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error('Không tìm thấy dữ liệu khóa học');
    }

    const fileData = {
      name: file.name,
      r2FileId: `/api/r2-proxy?key=${encodeURIComponent(masterPlaylistKey)}`,
      driveFileId: driveResult.fileId,
      driveUrl: driveResult.webViewLink,
      type: 'application/vnd.apple.mpegurl',
      uploadTime: new Date().toISOString()
    };

    const updatedChapters = courseData.chapters.map(chapter => {
      if (chapter.id === chapterId) {
        return {
          ...chapter,
          lessons: chapter.lessons.map(lesson => {
            if (lesson.id === lessonId) {
              return {
                ...lesson,
                files: [...(lesson.files || []), fileData]
              };
            }
            return lesson;
          })
        };
      }
      return chapter;
    });

    if (JSON.stringify(updatedChapters) === JSON.stringify(courseData.chapters)) {
      throw new Error('Không tìm thấy chapter hoặc lesson để cập nhật');
    }

    const cleanedData = removeUndefined({ chapters: updatedChapters });
    await updateDoc(courseRef, cleanedData);

    // Thêm các sendUpdate vào các bước xử lý
    sendUpdate({ step: 'Đang tải lên Google Drive', progress: 0 });
    // Code tải lên Google Drive
    sendUpdate({ step: 'Đã tải lên Google Drive', progress: 20 });

    sendUpdate({ step: 'Đang phân đoạn video', progress: 20 });
    // Code phân đoạn video
    sendUpdate({ step: 'Đã phân đoạn video', progress: 50 });

    sendUpdate({ step: 'Đang tải lên R2', progress: 50 });
    // Code tải lên R2
    sendUpdate({ step: 'Đã tải lên R2', progress: 80 });

    sendUpdate({ step: 'Đang cập nhật cơ sở dữ liệu', progress: 80 });
    // Code cập nhật cơ sở dữ liệu
    sendUpdate({ step: 'Hoàn thành', progress: 100 });

    // Kết thúc stream
    stream.end();

    return response;
  } catch (error) {
    console.error('Lỗi trong quá trình xử lý:', error);
    sendUpdate({ error: error.message });
    stream.end();
    return response;
  } finally {
    if (tempDir) {
      console.log('Xóa thư mục tạm thời:', tempDir);
      await fs.rm(tempDir, { recursive: true, force: true }).catch(console.error);
    }
  }

  console.log('=== Kết thúc xử lý request POST ===');
}

function parseFormData(req) {
  return new Promise((resolve, reject) => {
    console.log('Bắt đầu parse FormData');
    const bb = busboy({ headers: req.headers });
    const formData = {};

    bb.on('file', (name, file, info) => {
      console.log('Đang xử lý file:', name);
      const { filename, encoding, mimeType } = info;
      let fileContent = Buffer.alloc(0);

      file.on('data', (data) => {
        fileContent = Buffer.concat([fileContent, data]);
      });

      file.on('end', () => {
        console.log('Kết thúc xử lý file:', name);
        formData[name] = { filename, encoding, mimeType, content: fileContent, size: fileContent.length };
      });
    });

    bb.on('field', (name, val) => {
      console.log('Trường dữ liệu:', name, val);
      formData[name] = val;
    });

    bb.on('close', () => {
      console.log('Kết thúc parse FormData');
      resolve(formData);
    });

    bb.on('error', (error) => {
      console.error('Lỗi khi parse FormData:', error);
      reject(error);
    });

    req.body.pipe(bb);
  });
}
