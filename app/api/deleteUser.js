import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
console.log("deleteUser");
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).end();
  }

  const { userId } = req.body;

  try {
    console.log('Bắt đầu xóa người dùng:', userId);
    const auth = getAuth();
    const db = getFirestore();

    console.log('Xóa người dùng khỏi Authentication');
    await auth.deleteUser(userId);

    console.log('Xóa dữ liệu người dùng khỏi Firestore');
    await db.collection('users').doc(userId).delete();

    console.log('Người dùng đã được xóa thành công');
    res.status(200).json({ message: 'Người dùng đã được xóa thành công' });
  } catch (error) {
    console.error('Lỗi chi tiết khi xóa người dùng:', error);
    console.error('Stack trace:', error.stack);
    if (error.code === 'auth/user-not-found') {
      console.log('Không tìm thấy người dùng trong Authentication');
      res.status(404).json({ error: 'Không tìm thấy người dùng' });
    } else {
      console.error('Lỗi không xác định khi xóa người dùng');
      res.status(500).json({ error: 'Không thể xóa người dùng', details: error.message, stack: error.stack });
    }
  }
}