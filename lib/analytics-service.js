import { Redis } from 'ioredis';
import { promisify } from 'util';

const redis = new Redis();

class VideoAnalytics {
  static async trackView({
    videoId,
    userId,
    timestamp = Date.now(),
    duration = 0,
    quality = '720p',
    location = 'unknown',
    device = 'unknown',
    cacheHit = false
  }) {
    try {
      // Lưu thông tin view
      await redis.hset(`video:${videoId}:views:${timestamp}`, {
        userId,
        duration,
        quality,
        location,
        device,
        cacheHit,
        timestamp
      });

      // Cập nhật tổng views
      await redis.hincrby(`video:${videoId}:stats`, 'total_views', 1);
      
      // Cập nhật watch time
      await redis.hincrby(`video:${videoId}:stats`, 'total_duration', duration);

      // Cập nhật cache hits
      if (cacheHit) {
        await redis.hincrby(`video:${videoId}:stats`, 'cache_hits', 1);
      }

      // Lưu theo ngày
      const date = new Date(timestamp).toISOString().split('T')[0];
      await redis.hincrby(`stats:${date}`, `video:${videoId}`, 1);
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }

  static async getVideoStats(videoId) {
    try {
      // Lấy thống kê cơ bản
      const stats = await redis.hgetall(`video:${videoId}:stats`);
      
      // Lấy 24h gần nhất
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      
      const recentViews = await redis.zrangebyscore(
        `video:${videoId}:views`,
        oneDayAgo,
        now
      );

      // Tính toán metrics
      const cacheHitRate = (stats.cache_hits / stats.total_views) * 100;
      const avgDuration = stats.total_duration / stats.total_views;

      return {
        totalViews: parseInt(stats.total_views || 0),
        totalDuration: parseInt(stats.total_duration || 0),
        cacheHitRate: Math.round(cacheHitRate),
        avgDuration: Math.round(avgDuration),
        recentViews: recentViews.length,
        viewsLast24h: recentViews
      };
    } catch (error) {
      console.error('Get stats error:', error);
      return null;
    }
  }

  static async getDailyStats(days = 7) {
    const stats = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayStats = await redis.hgetall(`stats:${dateStr}`);
      stats.push({
        date: dateStr,
        ...dayStats
      });
    }

    return stats;
  }

  static async getPopularVideos(limit = 10) {
    try {
      // Lấy videos có nhiều views nhất
      const videos = await redis.zrevrange('videos:views', 0, limit - 1, 'WITHSCORES');
      
      // Format kết quả
      const result = [];
      for (let i = 0; i < videos.length; i += 2) {
        const videoId = videos[i];
        const views = parseInt(videos[i + 1]);
        const stats = await this.getVideoStats(videoId);
        
        result.push({
          videoId,
          views,
          ...stats
        });
      }

      return result;
    } catch (error) {
      console.error('Get popular videos error:', error);
      return [];
    }
  }

  static async generateReport(videoId, startDate, endDate) {
    try {
      const stats = await this.getVideoStats(videoId);
      const dailyStats = await this.getDailyStats(7);

      return {
        overview: stats,
        dailyBreakdown: dailyStats,
        metrics: {
          engagement: (stats.avgDuration / stats.totalDuration) * 100,
          popularity: await redis.zrevrank('videos:views', videoId),
          cacheEfficiency: stats.cacheHitRate
        }
      };
    } catch (error) {
      console.error('Generate report error:', error);
      return null;
    }
  }
}

export default VideoAnalytics; 