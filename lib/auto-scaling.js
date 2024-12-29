import { Redis } from 'ioredis';
import { LoadBalancer } from './load-balancer';
import { MonitoringDashboard } from './monitoring-dashboard';

class AutoScaling {
  constructor() {
    this.redis = new Redis();
    this.loadBalancer = new LoadBalancer();
    this.monitoring = new MonitoringDashboard();
    
    // Thresholds
    this.CPU_THRESHOLD = 80; // 80%
    this.MEMORY_THRESHOLD = 80; // 80%
    this.TRAFFIC_THRESHOLD = 1000; // requests/minute
  }

  async monitor() {
    setInterval(async () => {
      try {
        const metrics = await this.monitoring.getSystemStatus();
        await this.checkScaling(metrics);
      } catch (error) {
        console.error('Scaling monitor error:', error);
      }
    }, 60000); // Check mỗi phút
  }

  async checkScaling(metrics) {
    const needsScaling = this.analyzeMetrics(metrics);
    
    if (needsScaling.scaleUp) {
      await this.scaleUp();
    } else if (needsScaling.scaleDown) {
      await this.scaleDown();
    }
  }

  analyzeMetrics(metrics) {
    const servers = metrics.servers;
    const avgCPU = this.calculateAverage(servers.map(s => s.cpu));
    const avgMemory = this.calculateAverage(servers.map(s => s.memory));
    const totalTraffic = metrics.performance.throughput;

    return {
      scaleUp: 
        avgCPU > this.CPU_THRESHOLD ||
        avgMemory > this.MEMORY_THRESHOLD ||
        totalTraffic > this.TRAFFIC_THRESHOLD,
      scaleDown:
        avgCPU < this.CPU_THRESHOLD / 2 &&
        avgMemory < this.MEMORY_THRESHOLD / 2 &&
        totalTraffic < this.TRAFFIC_THRESHOLD / 2
    };
  }

  async scaleUp() {
    // Implement scaling logic (e.g., with AWS SDK or Docker API)
    await this.redis.incr('system:scaling:up');
    console.log('Scaling up servers...');
  }

  async scaleDown() {
    // Ensure safe scale down
    await this.redis.incr('system:scaling:down');
    console.log('Scaling down servers...');
  }
} 