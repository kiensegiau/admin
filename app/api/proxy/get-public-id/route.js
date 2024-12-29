import { encryptId } from '@/lib/encryption';

export async function POST(request) {
  try {
    const { driveId } = await request.json();
    if (!driveId) {
      return new Response('Missing drive ID', { status: 400 });
    }

    const publicId = encryptId(driveId);
    return new Response(JSON.stringify({ 
      success: true,
      data: { publicId }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal Server Error'
    }), { status: 500 });
  }
} 