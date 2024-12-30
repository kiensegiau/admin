import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Dùng Map để lưu rate limits
const rateLimits = new Map<string, { count: number; timestamp: number }>()

// Cleanup tự động mỗi phút
setInterval(() => {
  const now = Date.now()
  const expired = now - 60000 // 1 phút trước
  
  rateLimits.forEach((data, ip) => {
    if (data.timestamp < expired) {
      rateLimits.delete(ip)
    }
  })
}, 60000)

export async function middleware(request: NextRequest) {
  try {
    const ip = request.ip || '127.0.0.1'
    const now = Date.now()
    
    const current = rateLimits.get(ip) || { count: 0, timestamp: now }
    
    // Reset counter nếu đã qua 1 phút
    if (now - current.timestamp > 60000) {
      current.count = 1
      current.timestamp = now
    } else {
      current.count++
    }
    
    rateLimits.set(ip, current)
    
    // Giới hạn 60 requests/phút
    if (current.count > 600) {
      return new NextResponse('Too Many Requests', { 
        status: 429,
        headers: {
          'Content-Type': 'text/plain',
          'Retry-After': '60'
        }
      })
    }

    return NextResponse.next()

  } catch (error) {
    console.error('Middleware error:', error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: '/api/:path*'
} 