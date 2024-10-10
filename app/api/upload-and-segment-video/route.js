import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { uploadToR2Direct } from "../../utils/r2DirectUpload";
import { segmentVideo } from "../../utils/videoProcessing";
import { PassThrough } from 'stream';
import os from 'os';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { exec } from 'child_process';

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

    const outputDir = path.join(tempDir, 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const progressCallback = (progress) => {
      console.log(`Tiến độ xử lý: ${progress}%`);
      // Ở đây bạn có thể gửi tiến độ đến client nếu cần
    };

    const outputPath = await segmentVideo(inputPath, outputDir, progressCallback);

    const baseKey = `khoa-hoc/${courseName}/${chapterName}/${lessonName}`;
    const playlist = await fs.readFile(outputPath, 'utf8');
    const segments = await fs.readdir(outputDir);

    const segmentUploads = await Promise.all(segments.filter(file => file.endsWith('.ts')).map(async (segment) => {
      const segmentPath = path.join(outputDir, segment);
      const segmentContent = await fs.readFile(segmentPath);
      const segmentKey = `${baseKey}/${segment}`;
      const segmentFile = new File([segmentContent], segmentKey, { type: 'video/MP2T' });
      await uploadToR2Direct(segmentFile, courseName, chapterName, lessonName);
      return { segment, fileId: segmentKey };
    }));

    let updatedPlaylistContent = playlist;
    segmentUploads.forEach(({ segment, fileId }) => {
      updatedPlaylistContent = updatedPlaylistContent.replace(segment, `/api/r2-proxy?key=${encodeURIComponent(fileId)}`);
    });

    const playlistKey = `${baseKey}/playlist.m3u8`;
    const playlistFile = new File([updatedPlaylistContent], playlistKey, { type: 'application/x-mpegURL' });
    const { downloadUrl: playlistUrl } = await uploadToR2Direct(playlistFile, courseName, chapterName, lessonName);

    const courseRef = doc(db, 'courses', courseId);
    const courseDoc = await getDoc(courseRef);
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error('Không tìm thấy dữ liệu khóa học');
    }

    const fileData = {
      name: file.name,
      r2FileId: playlistKey,
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
                    videoUrl: playlistUrl,
                    files: [...(lesson.files || []), fileData]
                  }
                : lesson
            )
          }
        : chapter
    );

    await updateDoc(courseRef, { chapters: updatedChapters });

    const publicUrl = `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.NEXT_PUBLIC_R2_BUCKET_NAME}/${playlistKey}`;
    return NextResponse.json({ playlistKey, playlistUrl, publicUrl });
  } catch (error) {
    console.error("Lỗi chi tiết trong quá trình xử lý:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}