import { OAuth2Client } from 'google-auth-library';
import { getSession } from 'next-auth/react';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/auth/google/callback'
);

export default async function handler(req, res) {
  const session = await getSession({ req });
  const { refresh_token } = session.googleTokens;

  try {
    const { tokens } = await client.refreshToken(refresh_token);
    
    session.googleTokens = tokens;
    await session.save();

    res.status(200).json({ message: 'Token refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
}