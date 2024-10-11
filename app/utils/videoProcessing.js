import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const segmentVideoMultipleResolutions = async (inputPath, outputDir) => {
  const resolutions = [
    { height: 1080, bitrate: '5000k' },
    { height: 720, bitrate: '2500k' },
    { height: 480, bitrate: '1000k' }
  ];

  const durationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`;
  const duration = await new Promise((resolve, reject) => {
    exec(durationCommand, (error, stdout) => {
      if (error) reject(error);
      else resolve(parseFloat(stdout));
    });
  });

  const ffmpegPromises = resolutions.map(({ height, bitrate }) => {
    return new Promise((resolve, reject) => {
      const resolutionDir = path.join(outputDir, `${height}p`);
      fs.mkdirSync(resolutionDir, { recursive: true });
      const outputPath = path.join(resolutionDir, 'playlist.m3u8');

      const command = `ffmpeg -i "${inputPath}" -vf scale=-2:${height} -c:v libx264 -b:v ${bitrate} -c:a aac -b:a 128k -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename "${resolutionDir}/%03d.ts" "${outputPath}"`;

      exec(command, (error) => {
        if (error) {
          console.error(`Lỗi khi xử lý video ${height}p:`, error);
          reject(error);
        } else {
          console.log(`Hoàn thành xử lý video ${height}p`);
          resolve(outputPath);
        }
      });
    });
  });

  return Promise.all(ffmpegPromises);
};