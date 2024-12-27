import { google } from 'googleapis';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { access, constants } from 'fs/promises';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

async function ensureDirectoryExists(dirPath) {
  try {
    await access(dirPath, constants.F_OK);
  } catch {
    await mkdir(dirPath, { recursive: true });
  }
}

async function saveTokens(tokens) {
  const configDir = path.join(process.cwd(), 'config');
  const tokenPath = path.join(configDir, 'tokens.json');

  // Đảm bảo thư mục config tồn tại
  await ensureDirectoryExists(configDir);

  const tokenData = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || '',
    expiryDate: tokens.expiry_date
  };

  await writeFile(tokenPath, JSON.stringify(tokenData, null, 2));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return new Response('Missing authorization code', { status: 400 });
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    // Lưu tokens vào file
    await saveTokens(tokens);

    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/dashboard'
      }
    });

  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    return new Response('Error during authentication', { status: 500 });
  }
} 