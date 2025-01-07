import { encryptId } from '@/lib/encryption';

// Hàm trích xuất Drive ID từ URL
function extractDriveId(url) {
  try {
    console.log('Extracting from URL:', url);

    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,  // Format: /file/d/[id]
      /id=([a-zA-Z0-9_-]+)/,          // Format: ?id=[id]
      /\/d\/([a-zA-Z0-9_-]+)/,        // Format: /d/[id]
      /^([a-zA-Z0-9_-]+)$/            // Format: raw id
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      console.log('Pattern:', pattern, 'Match:', match);
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

// Hàm tạo URL đầy đủ cho proxy
function generateProxyUrls(publicId, baseUrl) {
  const proxyUrl = `${baseUrl}/api/proxy/files?id=${publicId}`;
  return {
    proxyUrl,
    streamUrl: proxyUrl,
    videoUrl: proxyUrl,
    embedHtml: `<video controls width="100%"><source src="${proxyUrl}" type="video/mp4"></video>`
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const inputUrl = searchParams.get('url') || searchParams.get('id');

  if (!inputUrl) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Missing URL or ID parameter'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Xác định Drive ID
    const driveId = inputUrl.includes('drive.google.com') 
      ? extractDriveId(inputUrl) 
      : inputUrl;

    if (!driveId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid Google Drive URL or ID'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Mã hóa ID
    const publicId = encryptId(driveId);

    // Lấy base URL từ request
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    const baseUrl = `${protocol}://${request.headers.get('host')}`;

    // Tạo các URL proxy
    const urls = generateProxyUrls(publicId, baseUrl);

    return new Response(JSON.stringify({
      success: true,
      data: {
        originalUrl: inputUrl,
        originalId: driveId,
        publicId: publicId,
        ...urls
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing URL:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to process URL'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// POST method tương tự như GET
export async function POST(request) {
  try {
    const body = await request.json();
    const inputUrl = body.url || body.id;

    if (!inputUrl) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing URL or ID in request body'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Tái sử dụng logic từ GET method
    const url = new URL(request.url);
    url.searchParams.set('url', inputUrl);
    return GET(new Request(url, request));

  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to process request'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 