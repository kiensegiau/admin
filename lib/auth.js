import { google } from 'googleapis';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import jwt from 'jsonwebtoken';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = '1h'; // Token hết hạn sau 1 giờ

// Đọc tokens từ file
async function getStoredTokens() {
  try {
    const tokenPath = path.join(process.cwd(), 'config', 'tokens.json');
    const tokenData = await readFile(tokenPath, 'utf8');
    return JSON.parse(tokenData);
  } catch (error) {
    console.error('Error reading tokens:', error);
    return null;
  }
}

// Lưu tokens mới vào file
async function saveTokens(tokens) {
  try {
    const tokenPath = path.join(process.cwd(), 'config', 'tokens.json');
    const tokenData = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      expiryDate: tokens.expiry_date
    };
    await writeFile(tokenPath, JSON.stringify(tokenData, null, 2));
  } catch (error) {
    console.error('Error saving tokens:', error);
  }
}

// Làm mới access token
async function refreshAccessToken() {
  try {
    const tokens = await getStoredTokens();
    if (!tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    oauth2Client.setCredentials({
      refresh_token: tokens.refreshToken
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    await saveTokens(credentials);
    
    return credentials.access_token;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return null;
  }
}

// Lấy access token hiện tại hoặc làm mới nếu hết hạn
export async function getAccessToken() {
  const tokens = await getStoredTokens();
  if (!tokens) return null;

  // Kiểm tra xem token có hết hạn chưa
  const expiryDate = new Date(tokens.expiryDate);
  if (expiryDate <= new Date()) {
    // Token đã hết hạn, thực hiện refresh
    return await refreshAccessToken();
  }

  return tokens.accessToken;
}

// Xác thực token
export async function authenticateToken(accessToken) {
  try {
    oauth2Client.setCredentials({ access_token: accessToken });
    const oauth2 = google.oauth2('v2');
    const response = await oauth2.userinfo.get({ auth: oauth2Client });
    return response.data;
  } catch (error) {
    console.error('Error authenticating token:', error);
    return null;
  }
}

// Kiểm tra quyền truy cập
export async function authorize(accessToken, action, resourceId) {
  try {
    // Vì đây là app admin và chỉ có bạn sử dụng
    // nên có thể return true luôn
    return true;

    // Hoặc nếu muốn kiểm tra kỹ hơn:
    /*
    const user = await authenticateToken(accessToken);
    if (!user) return false;
    
    // Thêm logic kiểm tra quyền ở đây
    switch (action) {
      case 'read':
        return true;
      case 'write':
        return true;
      case 'delete':
        return true;
      default:
        return false;
    }
    */
  } catch (error) {
    console.error('Error checking authorization:', error);
    return false;
  }
}

export function generateVideoToken(videoId) {
  return jwt.sign({ videoId }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyVideoToken(token, videoId) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.videoId === videoId;
  } catch {
    return false;
  }
}
