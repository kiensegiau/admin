import { NextResponse } from 'next/server';
import { testR2Connection } from '../../utils/r2DirectUpload';

export async function GET() {
  try {
    const isConnected = await testR2Connection();
    if (isConnected) {
      return NextResponse.json({ success: true, message: 'Kết nối NEXT_PUBLIC_R2 thành công' });
    } else {
      return NextResponse.json({ success: false, message: 'Kết nối NEXT_PUBLIC_R2 thất bại' }, { status: 500 });
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra kết nối NEXT_PUBLIC_R2:', error);
    return NextResponse.json({ success: false, message: 'Lỗi khi kiểm tra kết nối NEXT_PUBLIC_R2', error: error.message }, { status: 500 });
  }
}