import { NextResponse } from 'next/server';

export async function middleware(request) {
  console.log('Middleware được kích hoạt cho đường dẫn:', request.url);

  const accessToken = request.cookies.get('googleDriveAccessToken')?.value;
  const tokenExpiration = request.cookies.get('tokenExpiration')?.value;

  if (accessToken && tokenExpiration) {
    const now = Date.now();
    const expirationTime = parseInt(tokenExpiration);

    console.log('Thời gian hiện tại:', now);
    console.log('Thời gian hết hạn token:', expirationTime);

    // Nếu token sắp hết hạn (ví dụ: còn 5 phút)
    if (expirationTime - now < 5 * 60 * 1000) {
      console.log('Token sắp hết hạn, đang làm mới...');
      try {
        const response = await fetch('http://localhost:3000/api/auth/refresh-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refreshToken: accessToken }),
        });

        if (response.ok) {
          const { access_token, expires_in } = await response.json();
          const newExpiration = Date.now() + expires_in * 1000;

          console.log('Token đã được làm mới thành công');

          const newResponse = NextResponse.next();
          newResponse.cookies.set('googleDriveAccessToken', access_token, {
            maxAge: expires_in,
            path: '/'
          });
          newResponse.cookies.set('tokenExpiration', newExpiration.toString(), {
            maxAge: expires_in,
            path: '/'
          });

          return newResponse;
        }
      } catch (error) {
        console.error('Lỗi khi làm mới token:', error);
      }
    } else {
      console.log('Token vẫn còn hiệu lực');
    }
  } else {
    console.log('Không tìm thấy token hoặc thời gian hết hạn');
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
