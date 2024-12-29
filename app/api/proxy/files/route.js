import { decryptId } from '@/lib/encryption';
import { getAccessToken } from '@/lib/auth';
import { getFileMetadata, downloadFile } from '@/lib/drive';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const encryptedId = searchParams.get('id');

    if (!encryptedId) {
      return new Response('Missing video ID', { status: 400 });
    }

    // Giải mã ID
    const videoId = decryptId(encryptedId);
    if (!videoId) {
      return new Response('Invalid ID', { status: 400 });
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Lấy metadata để biết mime type
    const metadata = await getFileMetadata(videoId, accessToken);
    
    // Stream video
    const fileStream = await downloadFile(videoId, accessToken);
    return new Response(fileStream, {
      status: 200,
      headers: {
        'Content-Type': metadata.mimeType,
        'Content-Disposition': 'inline',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      },
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 