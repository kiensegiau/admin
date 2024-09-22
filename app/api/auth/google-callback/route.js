import { NextResponse } from 'next/server';
import { setCredentials } from '../../.././utils/driveUpload';

export async function GET(request) {
  console.log('Bắt đầu xử lý callback Google');
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    try {
      console.log('Nhận được mã xác thực:', code);
      const tokens = await setCredentials(code);
      console.log('Nhận được tokens:', JSON.stringify(tokens));
      
      const response = NextResponse.redirect(new URL('/dashboard', request.url));
      response.cookies.set('googleDriveAccessToken', tokens.access_token, { 
        maxAge: 3600,
        path: '/'
      });
      console.log('Đã set cookie và chuyển hướng đến /dashboard');
      return response;
    } catch (error) {
      console.error('Lỗi chi tiết khi xác thực:', error);
      console.error('Stack trace:', error.stack);
      return NextResponse.redirect(new URL('/dashboard?auth=error', request.url));
    }
  } else {
    console.error('Không nhận được mã xác thực');
    return NextResponse.json({ error: 'Không có mã xác thực' }, { status: 400 });
  }
}