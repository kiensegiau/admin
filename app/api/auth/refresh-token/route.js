import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

export async function POST(request) {
  try {
    const { token } = await request.json();
    const { tokens } = await oauth2Client.refreshToken(token);
    
    return new Response(JSON.stringify({ 
      accessToken: tokens.access_token,
      expiryDate: tokens.expiry_date 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    return new Response('Error refreshing token', { status: 500 });
  }
}
