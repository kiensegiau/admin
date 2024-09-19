import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export async function DELETE(request) {
  console.log('Nhận yêu cầu DELETE');
  let userId;
  try {
    const body = await request.json();
    userId = body.userId;
    console.log('UserId nhận được:', userId);

    if (!userId) {
      console.log('Không có userId được cung cấp');
      return new Response(JSON.stringify({ error: 'Không có userId được cung cấp' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log('Bắt đầu xóa người dùng:', userId);
    const auth = getAuth();
    const db = getFirestore();

    try {
      console.log('Xóa người dùng khỏi Authentication');
      await auth.deleteUser(userId);
    } catch (authError) {
      console.log('Lỗi khi xóa người dùng khỏi Authentication:', authError.message);
      if (authError.code !== 'auth/user-not-found') {
        throw authError;
      }
    }

    console.log('Xóa dữ liệu người dùng khỏi Firestore');
    await db.collection('users').doc(userId).delete();

    console.log('Người dùng đã được xóa thành công');
    return new Response(JSON.stringify({ message: 'Người dùng đã được xóa thành công' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Lỗi chi tiết khi xóa người dùng:', error);
    console.error('Stack trace:', error.stack);
    return new Response(JSON.stringify({ error: 'Không thể xóa người dùng', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}