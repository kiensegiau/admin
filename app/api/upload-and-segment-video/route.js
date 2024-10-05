import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { uploadToB2 } from "../../utils/b2Upload";
import { segmentVideo } from "../../utils/videoProcessing";
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
  console.log("Bắt đầu xử lý yêu cầu POST");
  const formData = await req.formData();
  const file = formData.get("file");
  const courseName = formData.get("courseName");
  const chapterName = formData.get("chapterName");
  const lessonName = formData.get("lessonName");
  const courseId = formData.get("courseId");
  const chapterId = formData.get("chapterId");
  const lessonId = formData.get("lessonId");

  if (!file || !courseId || !chapterId || !lessonId) {
    console.log("Thiếu các trường bắt buộc");
    return NextResponse.json({ error: "Thiếu các trường bắt buộc" }, { status: 400 });
  }

  try {
    console.log("Bắt đầu xử lý video");
    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = path.join(os.tmpdir(), uuidv4());
    fs.mkdirSync(tempDir, { recursive: true });
    const inputPath = path.join(tempDir, file.name);
    await fs.promises.writeFile(inputPath, buffer);

    console.log("Bắt đầu phân đoạn video");
    const { outputPath, outputDir } = await segmentVideo(inputPath, tempDir, () => {});
    console.log("Hoàn thành phân đoạn video");

    const playlist = await fs.promises.readFile(outputPath, 'utf8');
    const segments = fs.readdirSync(outputDir).filter(file => file.endsWith('.ts'));
    console.log(`Số lượng segment: ${segments.length}`);

    console.log("Bắt đầu upload các segment");
    const segmentUploads = await Promise.all(segments.map(async (segment, index) => {
      console.log(`Đang upload segment ${index + 1}/${segments.length}`);
      const segmentPath = path.join(outputDir, segment);
      const segmentContent = await fs.promises.readFile(segmentPath);
      const segmentFile = new File([segmentContent], segment, { type: 'video/MP2T' });
      return uploadToB2(segmentFile, courseName, chapterName, lessonName);
    }));
    console.log("Hoàn thành upload các segment");

    let updatedPlaylistContent = playlist;
    segmentUploads.forEach(({ downloadUrl }, index) => {
      updatedPlaylistContent = updatedPlaylistContent.replace(segments[index], downloadUrl);
    });

    console.log("Bắt đầu upload playlist");
    const updatedPlaylistFile = new File([updatedPlaylistContent], 'playlist.m3u8', { type: 'application/x-mpegURL' });
    const { fileId: playlistId, downloadUrl: playlistUrl } = await uploadToB2(updatedPlaylistFile, courseName, chapterName, lessonName);
    console.log("Hoàn thành upload playlist");

    console.log("Bắt đầu cập nhật dữ liệu khóa học");
    const courseRef = doc(db, 'courses', courseId);
    const courseDoc = await getDoc(courseRef);
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error('Không tìm thấy dữ liệu khóa học');
    }

    const fileData = {
      name: file.name,
      url: playlistUrl,
      type: 'application/x-mpegURL',
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
    console.log("Hoàn thành cập nhật dữ liệu khóa học");

    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("Đã xóa thư mục tạm");

    console.log("Hoàn thành xử lý yêu cầu POST");
    return NextResponse.json({ playlistId, playlistUrl });
  } catch (error) {
    console.error("Lỗi khi xử lý và upload video:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}