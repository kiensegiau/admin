import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { uploadToR2Direct } from "../../utils/r2DirectUpload";
import { segmentVideoMultipleResolutions } from "../../utils/videoProcessing";
import { PassThrough } from 'stream';
import os from 'os';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');

  const stream = new PassThrough();

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  return new NextResponse(stream, { headers });
}

export async function POST(req) {
  let tempDir = '';
  try {
    console.log("Bắt đầu xử lý yêu cầu POST");
    const formData = await req.formData();
    const { file, courseName, chapterName, lessonName, courseId, chapterId, lessonId } = Object.fromEntries(formData);

    if (!file || !courseId || !chapterId || !lessonId) {
      return NextResponse.json({ error: "Thiếu các trường bắt buộc" }, { status: 400 });
    }

    tempDir = path.join(os.tmpdir(), uuidv4());
    await fs.mkdir(tempDir, { recursive: true });
    const inputPath = path.join(tempDir, file.name);
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    const { outputPaths } = await segmentVideoMultipleResolutions(inputPath, tempDir, () => {});

    const uploadResults = await Promise.all(Object.entries(outputPaths).map(async ([bitrate, outputPath]) => {
      const bitrateDir = path.dirname(outputPath);
      const playlist = await fs.readFile(outputPath, 'utf8');
      const segments = await fs.readdir(bitrateDir);

      const segmentUploads = await Promise.all(segments.filter(file => file.endsWith('.ts')).map(async (segment) => {
        const segmentPath = path.join(bitrateDir, segment);
        const segmentContent = await fs.readFile(segmentPath);
        const segmentFile = new File([segmentContent], `${bitrate}/${segment}`, { type: 'video/MP2T' });
        return uploadToR2Direct(segmentFile, courseName, chapterName, lessonName);
      }));

      let updatedPlaylistContent = playlist;
      segmentUploads.forEach(({ fileId }, index) => {
        updatedPlaylistContent = updatedPlaylistContent.replace(segments[index], fileId);
      });

      const updatedPlaylistFile = new File([updatedPlaylistContent], `${bitrate}/playlist.m3u8`, { type: 'application/x-mpegURL' });
      return { bitrate, upload: await uploadToR2Direct(updatedPlaylistFile, courseName, chapterName, lessonName) };
    }));

    const resolutions = [
      { bitrate: '800k', name: '480p' },
      { bitrate: '1200k', name: '720p' },
      { bitrate: '2000k', name: '1080p' }
      
    ];

    const masterPlaylistContent = "#EXTM3U\n#EXT-X-VERSION:3\n" + uploadResults.map(({ bitrate, upload }) => {
      const resolution = resolutions.find(r => r.name === bitrate);
      return `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(resolution.bitrate)*1000},RESOLUTION=${bitrate}\n${upload.downloadUrl}`;
    }).join('\n');

    const masterPlaylistFile = new File([masterPlaylistContent], 'master.m3u8', { type: 'application/x-mpegURL' });
    const { fileId: masterPlaylistId, downloadUrl: masterPlaylistUrl } = await uploadToR2Direct(masterPlaylistFile, courseName, chapterName, lessonName);

    const courseRef = doc(db, 'courses', courseId);
    const courseDoc = await getDoc(courseRef);
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error('Không tìm thấy dữ liệu khóa học');
    }

    const fileData = {
      name: file.name,
      r2FileId: masterPlaylistId,
      type: 'application/vnd.apple.mpegurl',
      uploadTime: new Date().toISOString()
    };

    const updatedChapters = courseData.chapters.map(chapter => 
      chapter.id === chapterId
        ? {
            ...chapter,
            lessons: chapter.lessons.map(lesson =>
              lesson.id === lessonId
                ? {
                    ...lesson,
                    videoUrl: masterPlaylistUrl,
                    files: [...(lesson.files || []), fileData]
                  }
                : lesson
            )
          }
        : chapter
    );

    await updateDoc(courseRef, { chapters: updatedChapters });

    const publicUrl = `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.NEXT_PUBLIC_R2_BUCKET_NAME}/${masterPlaylistId}`;
    return NextResponse.json({ masterPlaylistId, masterPlaylistUrl, publicUrl });
  } catch (error) {
    console.error("Lỗi chi tiết trong quá trình xử lý:", error);
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: "Không thể tạo hoặc truy cập thư mục tạm thời" }, { status: 500 });
    } else if (error.code === 4294967294) {
      return NextResponse.json({ error: "Lỗi khi chạy FFmpeg. Kiểm tra quyền truy cập và đường dẫn" }, { status: 500 });
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}