// lib/proxy.js

import { getFileMetadata, downloadFile } from '../../../../lib/drive';
import { getAccessToken } from '../../../../lib/auth';
import { decryptId } from '@/lib/encryption';

// Cache thời gian dài (7 ngày)
const CACHE_DURATION = 7 * 24 * 60 * 60;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get('id');

    if (!publicId) {
      return new Response('Missing ID', { status: 400 });
    }

    const driveId = decryptId(publicId);
    const accessToken = await getAccessToken();
    const metadata = await getFileMetadata(driveId, accessToken);

    // Stream video với cache agressive
    const fileStream = await downloadFile(driveId, accessToken);
    return new Response(fileStream, {
      status: 200,
      headers: {
        'Content-Type': metadata.mimeType,
        'Content-Disposition': 'inline',
        'Accept-Ranges': 'bytes',
        
        // Cache Headers Aggressive
        'Cache-Control': `public, max-age=${CACHE_DURATION}, immutable`,
        'CDN-Cache-Control': `public, max-age=${CACHE_DURATION}`,
        'Cloudflare-CDN-Cache-Control': `public, max-age=${CACHE_DURATION}`,
        'Surrogate-Control': `max-age=${CACHE_DURATION}`,
        'Edge-Cache-Tag': `video-${publicId}`,
        
        // Prevent revalidation
        'ETag': `"video-${publicId}"`,
        'Last-Modified': new Date().toUTCString(),
        
        // CORS
        'Access-Control-Allow-Origin': '*',
        'Vary': 'Accept-Encoding'
      }
    });

  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Server Error', { status: 500 });
  }
}

export async function POST(request) {
  const accessToken = request.headers.get('Authorization')?.split('Bearer ')[1];

  if (!accessToken) {
    return new Response('Missing required parameters', { status: 400 });
  }

  try {
    const user = await authenticateToken(accessToken);
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const hasAccess = await authorize(user, 'create', null);
    if (!hasAccess) {
      return new Response('Forbidden', { status: 403 });
    }

    const fileData = await request.json();
    // Implement file upload logic here

    logRequest(request, 'File uploaded successfully', user.id);
    return new Response('File uploaded successfully', { status: 200 });
  } catch (error) {
    logError(request, error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function PUT(request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');
  const accessToken = searchParams.get('accessToken');

  if (!fileId || !accessToken) {
    return new Response('Missing required parameters', { status: 400 });
  }

  try {
    const fileData = await request.json();
    const updatedFile = await updateFile(fileId, fileData, accessToken);

    // Xử lý kết quả cập nhật tệp
    // ...

    return new Response('File updated successfully', { status: 200 });
  } catch (error) {
    console.error('Error updating file:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(request) {
  const { searchParams } = new URL(request.url);
  const fileId = searchParams.get('fileId');
  const accessToken = searchParams.get('accessToken');

  if (!fileId || !accessToken) {
    return new Response('Missing required parameters', { status: 400 });
  }

  try {
    await deleteFile(fileId, accessToken);

    return new Response('File deleted successfully', { status: 200 });
  } catch (error) {
    console.error('Error deleting file:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}