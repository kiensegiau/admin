import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { uploadToR2 } from "../../utils/r2Upload";
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

    console.log("Bắt đầu phân đoạn video và tạo nhiều bitrate");
    const { outputPaths, outputDir } = await segmentVideoMultipleResolutions(inputPath, tempDir, () => {});
    console.log("Hoàn thành phân đoạn video và tạo nhiều bitrate");

    console.log("Bắt đầu upload các segment và playlist");
    const uploadPromises = Object.entries(outputPaths).map(async ([bitrate, outputPath]) => {
      const bitrateDir = path.dirname(outputPath);
      const playlist = await fs.promises.readFile(outputPath, 'utf8');
      const segments = fs.readdirSync(bitrateDir).filter(file => file.endsWith('.ts'));

      const segmentUploads = await Promise.all(segments.map(async (segment) => {
        const segmentPath = path.join(bitrateDir, segment);
        const segmentContent = await fs.promises.readFile(segmentPath);
        const segmentFile = new File([segmentContent], `${bitrate}/${segment}`, { type: 'video/MP2T' });
        return uploadToR2(segmentFile, courseName, chapterName, lessonName);
      }));

      let updatedPlaylistContent = playlist;
      segmentUploads.forEach(({ fileId }, index) => {
        updatedPlaylistContent = updatedPlaylistContent.replace(segments[index], fileId);
      });

      const updatedPlaylistFile = new File([updatedPlaylistContent], `${bitrate}/playlist.m3u8`, { type: 'application/x-mpegURL' });
      return uploadToR2(updatedPlaylistFile, courseName, chapterName, lessonName);
    });

    const playlistUploads = await Promise.all(uploadPromises);
    console.log("Hoàn thành upload các segment và playlist");

    console.log("Bắt đầu tạo master playlist");
    let masterPlaylistContent = "#EXTM3U\n#EXT-X-VERSION:3\n";
    const resolutions = [
      { bitrate: '800k', name: '480p' },
      { bitrate: '1200k', name: '720p' },
      { bitrate: '2000k', name: '1080p' },
      { bitrate: '3000k', name: '1440p' }
    ];
    playlistUploads.forEach(({ downloadUrl }, index) => {
      const resolution = Object.keys(outputPaths)[index];
      const bitrate = resolutions.find(r => r.name === resolution).bitrate;
      masterPlaylistContent += `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(bitrate)*1000},RESOLUTION=${resolution}\n${downloadUrl}\n`;
    });

    const masterPlaylistFile = new File([masterPlaylistContent], 'master.m3u8', { type: 'application/x-mpegURL' });
    const { fileId: masterPlaylistId, downloadUrl: masterPlaylistUrl } = await uploadToR2(masterPlaylistFile, courseName, chapterName, lessonName);
    console.log("Hoàn thành tạo và upload master playlist");

    console.log("Bắt đầu cập nhật dữ liệu khóa học");
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
    console.log("Hoàn thành cập nhật dữ liệu khóa học");

    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log("Đã xóa thư mục tạm");

    console.log("Hoàn thành xử lý yêu cầu POST");
    return NextResponse.json({ masterPlaylistId, masterPlaylistUrl });
  } catch (error) {
    console.error("Lỗi khi xử lý và upload video:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}