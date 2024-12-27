import { NextResponse } from 'next/server';

export async function middleware(request) {
  console.log('Middleware activated for path:', request.url);

  const accessToken = request.cookies.get('googleDriveAccessToken')?.value;
  const tokenExpiration = request.cookies.get('tokenExpiration')?.value;

  if (accessToken && tokenExpiration) {
    const now = Date.now();
    const expirationTime = parseInt(tokenExpiration);

    console.log('Current time:', now);
    console.log('Token expiration time:', expirationTime);

    // If the token is about to expire (e.g., within 5 minutes)
    if (expirationTime - now < 5 * 60 * 1000) {
      console.log('Token is about to expire, refreshing...');
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

          console.log('Token refreshed successfully');

          const newResponse = NextResponse.next();
          newResponse.cookies.set('googleDriveAccessToken', access_token, {
            maxAge: expires_in,
            path: '/',
          });
          newResponse.cookies.set('tokenExpiration', newExpiration.toString(), {
            maxAge: expires_in,
            path: '/',
          });

          return newResponse;
        }
      } catch (error) {
        console.error('Error refreshing token:', error);
      }
    } else {
      console.log('Token is still valid');
    }
  } else {
    console.log('No token found or token expiration missing');
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
};
