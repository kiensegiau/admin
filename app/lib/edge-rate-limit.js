// Lưu trữ rate limit trong memory (trong môi trường production nên dùng Redis)
const rateLimit = new Map();

// Cấu hình rate limit
const RATE_LIMIT = {
  windowMs: 60 * 1000, // 1 phút
  max: 100 // Số request tối đa trong 1 phút
};

// Kiểm tra xem IP có bị rate limit không
export function isRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;
  
  if (!rateLimit.has(ip)) {
    return false;
  }

  const { count, timestamp } = rateLimit.get(ip);
  
  // Reset nếu đã hết thời gian window
  if (timestamp < windowStart) {
    rateLimit.delete(ip);
    return false;
  }

  return count > RATE_LIMIT.max;
}

// Tăng số lượng request cho IP
export function incrementRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;
  
  if (!rateLimit.has(ip) || rateLimit.get(ip).timestamp < windowStart) {
    rateLimit.set(ip, {
      count: 1,
      timestamp: now
    });
  } else {
    const current = rateLimit.get(ip);
    rateLimit.set(ip, {
      count: current.count + 1,
      timestamp: now
    });
  }

  const { count } = rateLimit.get(ip);
  
  return {
    limit: RATE_LIMIT.max,
    remaining: Math.max(0, RATE_LIMIT.max - count)
  };
} 