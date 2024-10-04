import { exec } from 'child_process';
import path from 'path';

export const segmentVideo = async (inputPath, outputDir, progressCallback) => {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(outputDir, 'output.m3u8');
    const ffmpegCommand = `ffmpeg -i "${inputPath}" -c:v libx264 -preset veryfast -crf 28 -c:a aac -b:a 128k -f hls -hls_time 10 -hls_list_size 0 "${outputPath}"`;

    const ffmpegProcess = exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Lỗi khi xử lý video: ${error.message}`);
        reject(error);
        return;
      }
      console.log('Hoàn thành quá trình phân đoạn video');
      resolve({ outputPath, outputDir });
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const match = data.match(/time=(\d{2}):(\d{2}):(\d{2}.\d{2})/);
      if (match) {
        const [, hours, minutes, seconds] = match;
        const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        progressCallback(totalSeconds);
      }
    });
  });
};