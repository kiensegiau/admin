import { Redis } from 'ioredis';

const redis = new Redis();

async function cleanupInactiveStreams() {
  // Lấy tất cả streams
  const streams = await redis.keys('stream:*');
  
  for (const streamKey of streams) {
    const data = await redis.hgetall(streamKey);
    
    // Kiểm tra streams không hoạt động > 5 phút
    if (Date.now() - data.timestamp > 5 * 60 * 1000) {
      await redis.del(streamKey);
    }
  }
}

// Chạy cleanup mỗi 5 phút
setInterval(cleanupInactiveStreams, 5 * 60 * 1000); 