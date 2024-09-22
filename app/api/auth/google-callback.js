import { setCredentials } from '../../../utils/driveUpload';

export default async function handler(req, res) {
  const { code } = req.query;

  if (code) {
    try {
      const tokens = await setCredentials(code);
      // Lưu access token vào cookie
      res.setHeader('Set-Cookie', `googleDriveAccessToken=${tokens.access_token}; HttpOnly; Path=/; Max-Age=3600`);
      res.redirect('/dashboard?auth=success');
    } catch (error) {
      console.error('Lỗi khi xác thực:', error);
      res.redirect('/dashboard?auth=error');
    }
  } else {
    res.status(400).json({ error: 'Không có mã xác thực' });
  }
}