// lib/proxy.js

import { getFileMetadata, downloadFile } from '../../../../lib/drive';
import { getAccessToken } from '../../../../lib/auth';
import { decryptId } from '@/lib/encryption';

// Cache thời gian dài (7 ngày)
const CACHE_DURATION = 7 * 24 * 60 * 60;
const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB mỗi chunk

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get('id');
    const range = request.headers.get('range');

    const driveId = decryptId(publicId);
    const metadata = await getFileMetadata(driveId);

    // Tính toán chunk index
    const start = range ? parseInt(range.replace(/bytes=/, '').split('-')[0]) : 0;
    const chunkIndex = Math.floor(start / CHUNK_SIZE);
    
    // Tạo unique key cho từng chunk
    const cacheKey = `video:${publicId}:chunk:${chunkIndex}`;

    // Check cache cho chunk cụ thể
    const cachedChunk = await getCachedChunk(cacheKey);
    if (cachedChunk) {
      return new Response(cachedChunk, {
        status: 206,
        headers: {
          'Content-Type': metadata.mimeType,
          'Content-Range': `bytes ${start}-${start + CHUNK_SIZE - 1}/${metadata.size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=604800', // 7 days
        }
      });
    }

    // Nếu không có trong cache, tải chunk từ Drive
    const accessToken = await getAccessToken();
    const chunkStream = await downloadFile(driveId, accessToken, {
      start,
      end: start + CHUNK_SIZE - 1
    });

    // Cache chunk mới tải
    await cacheChunk(cacheKey, chunkStream);

    return new Response(chunkStream, {
      status: 206,
      headers: {
        'Content-Type': metadata.mimeType,
        'Content-Range': `bytes ${start}-${start + CHUNK_SIZE - 1}/${metadata.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=604800',
      }
    });

  } catch (error) {
    console.error('Error:', error);
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