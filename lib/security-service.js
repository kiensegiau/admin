import { Redis } from 'ioredis';
import { rateLimit } from '@/lib/rate-limit';
import jwt from 'jsonwebtoken';

class SecurityService {
  constructor() {
    this.redis = new Redis();
    this.RATE_LIMIT = 100; // requests per minute
    this.TOKEN_EXPIRY = '1h';
  }

  async validateRequest(request) {
    try {
      // Kiểm tra tất cả security layers
      await Promise.all([
        this.checkDDoS(request),
        this.checkRateLimit(request),
        this.validateToken(request),
        this.validatePermissions(request)
      ]);

      return true;
    } catch (error) {
      console.error('Security validation failed:', error);
      throw error;
    }
  }

  async checkDDoS(request) {
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const key = `ddos:${ip}`;

    // Kiểm tra requests trong 1 phút
    const requests = await this.redis.incr(key);
    await this.redis.expire(key, 60);

    if (requests > this.RATE_LIMIT) {
      throw new Error('DDoS protection: Too many requests');
    }
  }

  async checkRateLimit(request) {
    const ip = request.headers.get('x-forwarded-for');
    const userId = request.headers.get('x-user-id');
    
    // Rate limit theo IP và userId
    await rateLimit.checkLimit(ip, 'ip');
    if (userId) {
      await rateLimit.checkLimit(userId, 'user');
    }
  }

  async validateToken(request) {
    const token = request.headers.get('authorization')?.split('Bearer ')[1];
    
    if (!token) {
      throw new Error('No token provided');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  async validatePermissions(request) {
    const token = await this.validateToken(request);
    const videoId = new URL(request.url).searchParams.get('id');

    // Kiểm tra permissions từ Redis
    const permissions = await this.redis.hget(`user:${token.userId}:permissions`, videoId);
    
    if (!permissions) {
      throw new Error('Access denied');
    }
  }

  async generateToken(userId, permissions) {
    return jwt.sign(
      { userId, permissions },
      process.env.JWT_SECRET,
      { expiresIn: this.TOKEN_EXPIRY }
    );
  }

  async revokeToken(token) {
    // Thêm token vào blacklist
    await this.redis.sadd('token:blacklist', token);
    await this.redis.expire(`token:blacklist:${token}`, 3600); // 1 hour
  }
}

export default SecurityService; 