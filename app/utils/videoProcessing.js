import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const segmentVideoMultipleResolutions = async (inputPath, outputDir, progressCallback) => {
  const resolutions = [

    { bitrate: '1200k', name: '720p' },
    { bitrate: '2000k', name: '1080p' }   
  ];

  // Tạo các thư mục con trước
  for (const { name } of resolutions) {
    const resolutionDir = path.join(outputDir, name);
    await fs.promises.mkdir(resolutionDir, { recursive: true });
  }

  const ffmpegPromises = resolutions.map(({ bitrate, name }) => {
    return new Promise((resolve, reject) => {
      const resolutionDir = path.join(outputDir, name);
      const outputPath = path.join(resolutionDir, 'playlist.m3u8');
      const command = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -b:v ${bitrate} -maxrate ${bitrate} -bufsize ${parseInt(bitrate)*2}k -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename "${resolutionDir}/%03d.ts" "${outputPath}"`;

      const ffmpegProcess = exec(command, (error, stdout, stderr) => {
        if (error) {
          console.error(`Lỗi khi xử lý video ${name}: ${error.message}`);
          reject(error);
        } else {
          console.log(`Hoàn thành xử lý video ${name}`);
          resolve(outputPath);
        }
      });

      ffmpegProcess.stderr.on('data', (data) => {
        const match = data.match(/time=(\d{2}):(\d{2}):(\d{2}.\d{2})/);
        if (match) {
          const [, hours, minutes, seconds] = match;
          const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
          if (typeof progressCallback === 'function') {
            progressCallback(totalSeconds, name);
          }
        }
      });
    });
  });

  try {
    const outputPaths = await Promise.all(ffmpegPromises);
    const result = resolutions.reduce((acc, { name }, index) => {
      acc[name] = outputPaths[index];
      return acc;
    }, {});
    return { outputPaths: result, outputDir };
  } catch (error) {
    console.error('Lỗi khi xử lý video:', error);
    throw error;
  }
};