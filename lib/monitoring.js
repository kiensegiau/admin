import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function trackVideoAccess(videoId, cacheStatus) {
  const date = new Date().toISOString().split('T')[0];
  
  // Track cache hits/misses
  await redis.hincrby(`stats:${date}:cache`, cacheStatus, 1);
  
  // Track video views
  await redis.hincrby(`stats:${date}:views`, videoId, 1);
  
  // Track bandwidth usage (estimate)
  if (cacheStatus === 'MISS') {
    await redis.hincrby(`stats:${date}:bandwidth`, 'origin', 1);
  } else {
    await redis.hincrby(`stats:${date}:bandwidth`, 'cache', 1);
  }
} 