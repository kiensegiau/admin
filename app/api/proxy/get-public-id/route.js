import { encryptId } from '@/lib/encryption';

export async function POST(request) {
  try {
    const { driveId } = await request.json();
    if (!driveId) {
      return new Response('Missing drive ID', { status: 400 });
    }

    const publicId = encryptId(driveId);
    return new Response(JSON.stringify({ publicId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response('Internal Server Error', { status: 500 });
  }
} 