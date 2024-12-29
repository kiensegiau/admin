import { generateVideoToken } from '@/lib/auth';
import { encryptId } from '@/lib/encryption';

// Hàm trích xuất Drive ID từ URL
function extractDriveId(url) {
  try {
    console.log('Extracting from URL:', url); // Log URL input

    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,  // Format: /file/d/[id]
      /id=([a-zA-Z0-9_-]+)/,          // Format: ?id=[id]
      /^([a-zA-Z0-9_-]+)$/            // Format: raw id
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      console.log('Pattern:', pattern, 'Match:', match); // Log matches
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  } catch (error) {
    console.error('Error extracting Drive ID:', error);
    return null;
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const urlParam = searchParams.get('url');
  const idParam = searchParams.get('id');

  console.log('URL Param:', urlParam); // Log URL parameter
  console.log('ID Param:', idParam);   // Log ID parameter

  // Lấy video ID từ URL hoặc trực tiếp
  const videoId = urlParam ? extractDriveId(urlParam) : idParam;
  console.log('Extracted Video ID:', videoId); // Log extracted ID

  if (!videoId) {
    return new Response('Missing or invalid video ID', { status: 400 });
  }

  try {
    // Mã hóa video ID
    const publicId = encryptId(videoId);
    console.log('Encrypted ID:', publicId); // Log encrypted ID
    
    // Tạo URL với token
    const videoUrl = `/api/proxy/files?id=${publicId}`;

    return new Response(JSON.stringify({
      url: videoUrl,
      originalId: videoId,
      encryptedId: publicId
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
} 