import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const segmentVideo = async (inputPath, outputDir, progressCallback) => {
  const outputPath = path.join(outputDir, 'playlist.m3u8');

  const durationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`;
  const duration = await new Promise((resolve, reject) => {
    exec(durationCommand, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve(parseFloat(stdout));
      }
    });
  });

  const command = `ffmpeg -i "${inputPath}" -c:v libx264 -preset fast -crf 22 -c:a aac -b:a 128k -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename "${outputDir}/%03d.ts" "${outputPath}"`;

  return new Promise((resolve, reject) => {
    const ffmpegProcess = exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Lỗi khi xử lý video: ${error.message}`);
        reject(error);
      } else {
        console.log('Hoàn thành xử lý video');
        resolve(outputPath);
      }
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const match = data.match(/time=(\d{2}):(\d{2}):(\d{2}.\d{2})/);
      if (match) {
        const [, hours, minutes, seconds] = match;
        const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        const progress = (totalSeconds / duration) * 100;
        if (typeof progressCallback === 'function') {
          progressCallback(progress.toFixed(2));
        }
        console.log(`Tiến độ xử lý: ${progress.toFixed(2)}%`);
      }
    });
  });
};