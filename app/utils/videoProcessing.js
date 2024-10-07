import { exec } from 'child_process';
import path from 'path';

export const segmentVideoMultipleResolutions = async (inputPath, outputDir, progressCallback) => {
  return new Promise((resolve, reject) => {
    const outputPaths = {};
    const resolutions = [
      { bitrate: '800k', name: '480p' },
      { bitrate: '1200k', name: '720p' },
      { bitrate: '2000k', name: '1080p' },
      { bitrate: '3000k', name: '1440p' }
    ];
    const ffmpegCommands = resolutions.map(({ bitrate, name }) => {
      const resolutionDir = path.join(outputDir, name);
      const outputPath = path.join(resolutionDir, 'playlist.m3u8');
      outputPaths[name] = outputPath;
      return `ffmpeg -i "${inputPath}" -c:v copy -c:a copy -b:v ${bitrate} -maxrate ${bitrate} -bufsize ${parseInt(bitrate)*2}k -f hls -hls_time 10 -hls_list_size 0 -hls_segment_filename "${resolutionDir}/%03d.ts" "${outputPath}"`;
    });

    const ffmpegProcess = exec(ffmpegCommands.join(' && '), (error, stdout, stderr) => {
      if (error) {
        console.error(`Lỗi khi xử lý video: ${error.message}`);
        reject(error);
        return;
      }
      console.log('Hoàn thành quá trình phân đoạn video và tạo nhiều bitrate');
      resolve({ outputPaths, outputDir });
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const match = data.match(/time=(\d{2}):(\d{2}):(\d{2}.\d{2})/);
      if (match) {
        const [, hours, minutes, seconds] = match;
        const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        if (typeof progressCallback === 'function') {
          progressCallback(totalSeconds);
        }
      }
    });
  });
};