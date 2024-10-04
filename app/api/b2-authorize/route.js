import { NextResponse } from "next/server";

export async function POST() {
  try {
    const authResponse = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      method: 'GET',
      headers: {
        Authorization: 'Basic ' + Buffer.from(process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID + ':' + process.env.NEXT_PUBLIC_B2_APPLICATION_KEY).toString('base64')
      }
    });

    if (!authResponse.ok) {
      throw new Error(`B2 authorization failed: ${authResponse.statusText}`);
    }

    const authData = await authResponse.json();
    return NextResponse.json(authData);
  } catch (error) {
    console.error('B2 authorization error:', error);
    return NextResponse.json({ error: 'B2 authorization failed' }, { status: 500 });
  }
}
