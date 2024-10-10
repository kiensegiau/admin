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
import { exec } from 'child_process';
import { uploadToR2MultiPart } from '../../utils/r2Upload';

function getBandwidth(resolution) {
  const bandwidths = {
    '360p': 800000,
    '480p': 1400000,
    '720p': 2800000,
    '1080p': 5000000
  };
  return bandwidths[resolution] || 1000000;
}

function getResolution(resolution) {
  const resolutions = {
    '360p': '640x360',
    '480p': '854x480',
    '720p': '1280x720',
    '1080p': '1920x1080'
  };
  return resolutions[resolution] || '854x480';
}

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

    const progressCallback = (progress, resolution) => {
      console.log(`Tiến độ xử lý ${resolution}: ${progress}%`);
      // Ở đây bạn có thể gửi tiến độ đến client nếu cần
    };

    const outputPaths = await segmentVideoMultipleResolutions(inputPath, outputDir, progressCallback);

    const baseKey = `khoa-hoc/${courseName}/${chapterName}/${lessonName}`;
    const resolutionUploads = await Promise.all(outputPaths.map(async (outputPath) => {
      const resolution = path.basename(path.dirname(outputPath));
      const playlist = await fs.readFile(outputPath, 'utf8');
      const segments = await fs.readdir(path.dirname(outputPath));
      const tsSegments = segments.filter(file => file.endsWith('.ts'));

      // Tải lên các phân đoạn video
      const segmentUploads = await Promise.all(tsSegments.map(async (segment) => {
        const segmentPath = path.join(path.dirname(outputPath), segment);
        const segmentContent = await fs.readFile(segmentPath);
        const segmentKey = `${baseKey}/${resolution}/${segment}`;
        return uploadToR2MultiPart(segmentContent, segmentKey, courseName, chapterName, lessonName);
      }));

      // Cập nhật nội dung playlist với các URL mới của phân đoạn
      let updatedPlaylistContent = playlist;
      const tsSegmentsInPlaylist = tsSegments.filter(segment => playlist.includes(segment));
      updatedPlaylistContent = playlist.split('\n').map(line => {
        if (!line.startsWith('#') && line.trim() !== '') {
          const segmentName = line.trim();
          if (tsSegmentsInPlaylist.includes(segmentName)) {
            const segmentKey = `${baseKey}/${resolution}/${segmentName}`;
            return `/api/r2-proxy?key=${encodeURIComponent(segmentKey)}`;
          }
        }
        return line;
      }).join('\n');

      console.log("Nội dung playlist đã cập nhật:", updatedPlaylistContent);

      // Tạo và tải lên tệp playlist cập nhật
      const playlistKey = `${baseKey}/${resolution}/playlist.m3u8`;
      const playlistFile = new File([updatedPlaylistContent], playlistKey, { type: 'application/x-mpegURL' });
      // Sử dụng phương thức tải lên trực tiếp cho tệp playlist nhỏ hơn
      const { downloadUrl: playlistUrl } = await uploadToR2Direct(playlistFile, courseName, chapterName, lessonName);

      // Trả về thông tin về độ phân giải và URL của playlist
      return { resolution, playlistUrl };
    }));

    // Tạo master playlist
    const masterPlaylistContent = resolutionUploads.map(({ resolution, playlistUrl }) => {
      const encodedKey = encodeURIComponent(`${baseKey}/${resolution}/playlist.m3u8`);
      return `#EXT-X-STREAM-INF:BANDWIDTH=${getBandwidth(resolution)},RESOLUTION=${getResolution(resolution)}\n/api/r2-proxy?key=${encodedKey}`;
    }).join('\n');

    const masterPlaylistKey = `${baseKey}/master.m3u8`;
    const masterPlaylistFile = new File([masterPlaylistContent], masterPlaylistKey, { type: 'application/x-mpegURL' });
    const { downloadUrl: masterPlaylistUrl } = await uploadToR2Direct(masterPlaylistFile, courseName, chapterName, lessonName);

    // Cập nhật thông tin khóa học
    const courseRef = doc(db, 'courses', courseId);
    const courseDoc = await getDoc(courseRef);
    const courseData = courseDoc.data();

    if (!courseData) {
      throw new Error('Không tìm thấy dữ liệu khóa học');
    }

    const fileData = {
      name: file.name,
      r2FileId: `/api/r2-proxy?key=${encodeURIComponent(masterPlaylistKey)}`,
      type: 'application/vnd.apple.mpegurl',
      uploadTime: new Date().toISOString()
    };

    const proxyVideoUrl = `/api/r2-proxy?key=${encodeURIComponent(masterPlaylistKey)}`;

    const updatedChapters = courseData.chapters.map(chapter => 
      chapter.id === chapterId
        ? {
            ...chapter,
            lessons: chapter.lessons.map(lesson =>
              lesson.id === lessonId
                ? {
                    ...lesson,
                 
                    files: [...(lesson.files || []), fileData]
                  }
                : lesson
            )
          }
        : chapter
    );

    await updateDoc(courseRef, { chapters: updatedChapters });

    return NextResponse.json({ masterPlaylistKey, masterPlaylistUrl });
  } catch (error) {
    console.error("Lỗi chi tiết trong quá trình xử lý:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
}