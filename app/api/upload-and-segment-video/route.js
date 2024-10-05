import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { uploadToB2 } from "../../utils/b2Upload";
import { segmentVideo } from "../../utils/videoProcessing";
import { PassThrough } from 'stream';
import os from 'os';
import { getFirestore, doc, getDoc, updateDoc } from 'firebase/firestore';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');

  const stream = new PassThrough();

  const sendEvent = (data) => {
    stream.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  const streamResponse = new NextResponse(stream, { headers });

  return streamResponse;
}

export async function POST(req) {
  const formData = await req.formData();
  const file = formData.get("file");
  const courseName = formData.get("courseName");
  const chapterName = formData.get("chapterName");
  const lessonName = formData.get("lessonName");
  const courseId = formData.get("courseId");
  const chapterId = formData.get("chapterId");
  const lessonId = formData.get("lessonId");

  if (!file) {
    if (!file || !courseId || !chapterId || !lessonId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
  }

  try {
    console.log('Bắt đầu xử lý POST request');
    console.log('File nhận được:', file.name);
    console.log('Coursename:', courseName);

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = path.join(os.tmpdir(), uuidv4());
    fs.mkdirSync(tempDir, { recursive: true });
    const inputPath = path.join(tempDir, file.name);
    await fs.promises.writeFile(inputPath, buffer);

    const { outputPath, outputDir } = await segmentVideo(inputPath, tempDir);

    const playlist = await fs.promises.readFile(outputPath, 'utf8');
    const segments = fs.readdirSync(outputDir).filter(file => file.endsWith('.ts'));

    const segmentUploads = await Promise.all(segments.map(async (segment) => {
      const segmentPath = path.join(outputDir, segment);
      const segmentContent = await fs.promises.readFile(segmentPath);
      const segmentFile = new File([segmentContent], segment, { type: 'video/MP2T' });
      const result = await uploadToB2(segmentFile, courseName, chapterName, lessonName);
      console.log(`Segment ${segment} uploaded. URL: ${result.downloadUrl}`);
      return result;
    }));

    let updatedPlaylistContent = playlist;
    segmentUploads.forEach(({ fileId, downloadUrl }, index) => {
      updatedPlaylistContent = updatedPlaylistContent.replace(
        segments[index],
        downloadUrl
      );
    });

    const updatedPlaylistFile = new File([updatedPlaylistContent], 'playlist.m3u8', { type: 'application/x-mpegURL' });
    const { fileId: playlistId, downloadUrl: playlistUrl } = await uploadToB2(updatedPlaylistFile, courseName, chapterName, lessonName);

    console.log('Nội dung playlist sau khi cập nhật:');
    console.log(updatedPlaylistContent);

    console.log(`Playlist uploaded. URL: ${playlistUrl}`);

    // Lưu thông tin vào Firebase
    const db = getFirestore();
    const courseRef = doc(db, 'courses', courseId);
    const courseDoc = await getDoc(courseRef);
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error('Không tìm thấy dữ liệu khóa học');
    }

    const fileData = {
      name: 'playlist.m3u8',
      url: playlistUrl,
      type: 'application/x-mpegURL',
      uploadTime: new Date().toISOString()
    };

    const updatedChapters = courseData.chapters.map(chapter => {
      if (chapter.id === chapterId) {
        const updatedLessons = chapter.lessons.map(lesson => {
          if (lesson.id === lessonId) {
            return {
              ...lesson,
              videoUrl: playlistUrl,
              files: [...(lesson.files || []), fileData]
            };
          }
          return lesson;
        });
        return { ...chapter, lessons: updatedLessons };
      }
      return chapter;
    });

    await updateDoc(courseRef, { chapters: updatedChapters });

    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log('Xử lý POST request hoàn tất');
    return NextResponse.json({ playlistId, playlistUrl });
  } catch (error) {
    console.error("Lỗi khi xử lý và upload video:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}