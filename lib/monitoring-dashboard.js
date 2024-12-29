import { Redis } from 'ioredis';
import { Analytics } from './analytics';
import { CacheManager } from './cache-manager';
import { LoadBalancer } from './load-balancer';

class MonitoringDashboard {
  constructor() {
    this.redis = new Redis();
    this.analytics = new Analytics();
    this.cacheManager = new CacheManager();
    this.loadBalancer = new LoadBalancer();
  }

  async getSystemStatus() {
    try {
      const [cacheStats, serverHealth, performance] = await Promise.all([
        this.getCacheMetrics(),
        this.getServerHealth(),
        this.getPerformanceMetrics()
      ]);

      return {
        timestamp: Date.now(),
        cache: cacheStats,
        servers: serverHealth,
        performance: performance
      };
    } catch (error) {
      console.error('Monitoring error:', error);
      throw error;
    }
  }

  async getCacheMetrics() {
    // Cache statistics
    const cloudflareStats = await this.getCloudflareStats();
    const nginxStats = await this.getNginxStats();

    return {
      cloudflare: {
        hitRate: cloudflareStats.hitRate,
        missRate: cloudflareStats.missRate,
        bandwidth: cloudflareStats.bandwidth,
        status: cloudflareStats.status
      },
      nginx: {
        hitRate: nginxStats.hitRate,
        missRate: nginxStats.missRate,
        diskUsage: nginxStats.diskUsage,
        status: nginxStats.status
      },
      totalRequests: cloudflareStats.totalRequests + nginxStats.totalRequests,
      efficiency: (cloudflareStats.hitRate + nginxStats.hitRate) / 2
    };
  }

  async getServerHealth() {
    const servers = await this.loadBalancer.checkServers();
    
    return servers.map(server => ({
      url: server.url,
      status: server.status,
      cpu: server.metrics?.cpu || 0,
      memory: server.metrics?.memory || 0,
      network: server.metrics?.network || 0,
      activeConnections: server.metrics?.connections || 0
    }));
  }

  async getPerformanceMetrics() {
    const metrics = await this.redis.hgetall('system:performance');
    
    return {
      responseTime: parseFloat(metrics.avgResponseTime || 0),
      throughput: parseInt(metrics.requestsPerSecond || 0),
      errorRate: parseFloat(metrics.errorRate || 0),
      bandwidth: {
        in: parseInt(metrics.bandwidthIn || 0),
        out: parseInt(metrics.bandwidthOut || 0)
      },
      concurrent: {
        users: parseInt(metrics.concurrentUsers || 0),
        streams: parseInt(metrics.activeStreams || 0)
      }
    };
  }

  async updateMetrics() {
    // Cập nhật metrics mỗi 5 giây
    setInterval(async () => {
      const status = await this.getSystemStatus();
      
      // Lưu metrics vào Redis
      await this.redis.hset('system:current', {
        status: JSON.stringify(status),
        timestamp: Date.now()
      });

      // Lưu historical data
      await this.redis.zadd('system:history', Date.now(), JSON.stringify(status));
      
      // Cleanup old data (giữ 7 ngày)
      const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      await this.redis.zremrangebyscore('system:history', 0, weekAgo);
    }, 5000);
  }

  async getHistoricalData(startTime, endTime) {
    return await this.redis.zrangebyscore(
      'system:history',
      startTime,
      endTime
    );
  }

  async generateReport(timeRange = '24h') {
    const now = Date.now();
    const startTime = now - this.getTimeRangeInMs(timeRange);
    
    const data = await this.getHistoricalData(startTime, now);
    
    return {
      timeRange,
      summary: this.analyzeTrends(data),
      recommendations: await this.generateRecommendations(data),
      alerts: await this.checkAlerts(data)
    };
  }

  getTimeRangeInMs(range) {
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    return ranges[range] || ranges['24h'];
  }
}

export default MonitoringDashboard; 