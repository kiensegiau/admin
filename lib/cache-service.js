import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const CACHE_DIR = path.join(process.cwd(), 'video-cache');

// Đảm bảo thư mục cache tồn tại
await fs.mkdir(CACHE_DIR, { recursive: true });

export class VideoCacheService {
  static async getVideo(driveId) {
    const cachePath = path.join(CACHE_DIR, `${driveId}.mp4`);
    const cacheStatus = await redis.get(`video:${driveId}:status`);

    // Nếu video đã được cache
    if (cacheStatus === 'ready') {
      return {
        status: 'ready',
        path: cachePath
      };
    }

    // Nếu đang trong quá trình cache
    if (cacheStatus === 'downloading') {
      return {
        status: 'downloading',
        message: 'Video is being cached'
      };
    }

    return { status: 'not_found' };
  }

  static async cacheVideo(driveId, accessToken) {
    try {
      // Đánh dấu đang download
      await redis.set(`video:${driveId}:status`, 'downloading');

      // Download từ Drive
      const videoStream = await downloadFile(driveId, accessToken);
      const cachePath = path.join(CACHE_DIR, `${driveId}.mp4`);
      
      // Lưu vào cache
      await pipeline(
        videoStream,
        fs.createWriteStream(cachePath)
      );

      // Cập nhật trạng thái
      await redis.set(`video:${driveId}:status`, 'ready');
      await redis.expire(`video:${driveId}:status`, 60 * 60 * 24 * 7); // 7 ngày

      return { success: true, path: cachePath };
    } catch (error) {
      console.error('Cache error:', error);
      await redis.del(`video:${driveId}:status`);
      return { success: false, error: error.message };
    }
  }
} 