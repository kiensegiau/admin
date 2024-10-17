import { OAuth2Client } from 'google-auth-library';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/auth/google/callback'
);

export async function POST(req) {
  try {
    const { refreshToken } = await req.json();
    const { tokens } = await client.refreshToken(refreshToken);
    
    return new Response(JSON.stringify({
      access_token: tokens.access_token,
      expires_in: tokens.expires_in
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Lỗi khi làm mới token:', error);
    return new Response(JSON.stringify({ error: 'Không thể làm mới token' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
