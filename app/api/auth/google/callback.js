import { setCredentials } from '../../../utils/driveUpload';

export default async function handler(req, res) {
  const { code } = req.query;

  if (code) {
    try {
      const tokens = await setCredentials(code);
      // Lưu tokens vào database hoặc session
      res.redirect('/admin-dashboard?auth=success');
    } catch (error) {
      console.error('Lỗi khi xác thực:', error);
      res.redirect('/admin-dashboard?auth=error');
    }
  } else {
    res.status(400).json({ error: 'Không có mã xác thực' });
  }
}