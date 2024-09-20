import { OAuth2Client } from 'google-auth-library';
import { getSession } from 'next-auth/react';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/auth/google/callback'
);

export default async function handler(req, res) {
  const { code } = req.query;
  const { tokens } = await client.getToken(code);
  
  const session = await getSession({ req });
  session.googleTokens = tokens;
  await session.save();
  
  res.redirect('/admin/dashboard');
}