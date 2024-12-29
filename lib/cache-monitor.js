class CacheMonitor {
  static async checkCacheStatus(videoId) {
    try {
      const response = await fetch(`/api/proxy/files?id=${videoId}`);
      
      const cacheInfo = {
        cloudflare: response.headers.get('CF-Cache-Status'),
        location: response.headers.get('X-Cache-Location'),
        nginx: response.headers.get('X-Cache-Status')
      };

      // Log vào Redis để theo dõi
      await redis.hset(`video:${videoId}:cache_status`, {
        timestamp: Date.now(),
        ...cacheInfo
      });

      return {
        status: 'success',
        cache: cacheInfo,
        message: this.getCacheMessage(cacheInfo)
      };

    } catch (error) {
      console.error('Cache check error:', error);
      return {
        status: 'error',
        error: error.message
      };
    }
  }

  static getCacheMessage(cacheInfo) {
    if (cacheInfo.cloudflare === 'HIT') {
      return 'Video served from Cloudflare Cache';
    }
    if (cacheInfo.nginx === 'HIT') {
      return 'Video served from NGINX Cache';
    }
    return 'Video served from Origin';
  }

  static async getCacheStats(videoId) {
    // Lấy thống kê cache
    const stats = await redis.hgetall(`video:${videoId}:cache_status`);
    
    return {
      cloudflareHits: parseInt(stats.cloudflare_hits || 0),
      nginxHits: parseInt(stats.nginx_hits || 0),
      totalRequests: parseInt(stats.total_requests || 0),
      efficiency: {
        cloudflare: (stats.cloudflare_hits / stats.total_requests) * 100,
        nginx: (stats.nginx_hits / stats.total_requests) * 100
      }
    };
  }
}

export default CacheMonitor; 