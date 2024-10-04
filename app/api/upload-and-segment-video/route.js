import { NextResponse } from "next/server";
import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { uploadToB2 } from "../../utils/b2Upload";
import { segmentVideo } from "../../utils/videoProcessing";
import { PassThrough } from 'stream';
import os from 'os';

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

  // Gửi sự kiện khởi tạo
  sendEvent({ stage: 'init', message: 'Bắt đầu xử lý video' });

  return streamResponse;
}

export async function POST(req) {
  const formData = await req.formData();
  const file = formData.get("file");
  const courseName = formData.get("courseName");
  const chapterName = formData.get("chapterName");
  const lessonName = formData.get("lessonName");

  if (!file) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const stream = new PassThrough();
  const encoder = new TextEncoder();

 const sendEvent = (data) => {
   stream.write(`data: ${JSON.stringify(data)}\n\n`);
 };

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  };

  const streamResponse = new NextResponse(stream, { headers });

  // Xử lý video và upload lên B2
  try {
    console.log('Bắt đầu xử lý POST request');
    console.log('File nhận được:', file.name);
    console.log('Coursename:', courseName);
    console.log('Chaptername:', chapterName);
    console.log('Lessonname:', lessonName);

    // Thêm log trước mỗi lần gọi sendEvent
    console.log('Gửi sự kiện:', { stage: 'processing', progress: 0 });
    sendEvent({ stage: 'processing', progress: 0 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const tempDir = path.join(os.tmpdir(), uuidv4());
    fs.mkdirSync(tempDir, { recursive: true });
    const inputPath = path.join(tempDir, file.name);
    await fs.promises.writeFile(inputPath, buffer);

    const { outputPath, outputDir } = await segmentVideo(inputPath, tempDir, (progress) => {
      sendEvent({ stage: 'processing', progress });
    });

    // Thêm log sau khi xử lý video
    console.log('Xử lý video hoàn tất');

    sendEvent({ stage: 'uploading', progress: 0 });

    const playlist = await fs.promises.readFile(outputPath);
    const segments = await Promise.all(
      fs.readdirSync(outputDir)
        .filter(file => file.endsWith('.ts'))
        .map(async file => {
          const filePath = path.join(outputDir, file);
          const content = await fs.promises.readFile(filePath);
          return new File([content], file, { type: 'video/MP2T' });
        })
    );

    // Thêm log trước và sau khi upload playlist
    console.log('Bắt đầu upload playlist');
    const playlistId = await uploadToB2(new File([playlist], 'playlist.m3u8', { type: 'application/x-mpegURL' }), courseName, chapterName, lessonName);
    console.log('Upload playlist hoàn tất, ID:', playlistId);
    sendEvent({ stage: 'uploading', progress: 50 });

    // Thêm log trước và sau khi upload segments
    console.log('Bắt đầu upload segments');
    const segmentIds = await Promise.all(segments.map((segment, index) => 
      uploadToB2(segment, courseName, chapterName, lessonName).then(id => {
        console.log(`Upload segment ${index + 1}/${segments.length} hoàn tất, ID:`, id);
        sendEvent({ stage: 'segment', progress: (index + 1) / segments.length * 100, segmentIndex: index });
        return id;
      })
    ));
    console.log('Upload tất cả segments hoàn tất');

    fs.rmSync(outputDir, { recursive: true, force: true });

    // Thêm log trước khi kết thúc
    console.log('Xử lý POST request hoàn tất');
    sendEvent({ stage: 'complete', message: 'Upload hoàn tất' });
    stream.end();

    return streamResponse;
  } catch (error) {
    console.error('Lỗi khi xử lý và upload video:', error);
    sendEvent({ stage: 'error', message: error.message });
    stream.end();
    return streamResponse;
  }
}