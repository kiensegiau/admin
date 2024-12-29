import { decryptId } from '@/lib/encryption';
import { getAccessToken } from '@/lib/auth';
import { getFileMetadata, downloadFile } from '@/lib/drive';

const PART_SIZE = 150 * 1024 * 1024; // 150MB mỗi part
const MAX_CACHE_AGE = 7 * 24 * 60 * 60; // 7 ngày

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get('id');
    const part = searchParams.get('part');

    const driveId = decryptId(publicId);
    const metadata = await getFileMetadata(driveId);

    // 1. PDF và documents - Cache toàn bộ
    if (metadata.mimeType === 'application/pdf' || 
        metadata.mimeType.includes('document')) {
      const fileStream = await downloadFile(driveId);
      return new Response(fileStream, {
        status: 200,
        headers: {
          'Content-Type': metadata.mimeType,
          'Content-Length': metadata.size,
          'Content-Disposition': 'inline',
          'Cache-Control': `public, max-age=${MAX_CACHE_AGE}, immutable`,
          'CDN-Cache-Control': `public, max-age=${MAX_CACHE_AGE}`,
          'CF-Cache-Tag': `doc-${publicId}`,
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 2. Video files - Cache theo parts
    if (metadata.mimeType.includes('video')) {
      // 2.1 File nhỏ - Cache toàn bộ
      if (metadata.size < 100 * 1024 * 1024) {
        const fileStream = await downloadFile(driveId);
        return new Response(fileStream, {
          status: 200,
          headers: {
            'Content-Type': metadata.mimeType,
            'Content-Length': metadata.size,
            'Cache-Control': `public, max-age=${MAX_CACHE_AGE}, immutable`,
            'CDN-Cache-Control': `public, max-age=${MAX_CACHE_AGE}`,
            'CF-Cache-Tag': `video-${publicId}`,
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // 2.2 File lớn - Cache từng part
      if (part) {
        const start = parseInt(part) * PART_SIZE;
        const end = Math.min(start + PART_SIZE - 1, metadata.size);
        
        const partStream = await downloadFile(driveId, { start, end });
        return new Response(partStream, {
          status: 200,
          headers: {
            'Content-Type': metadata.mimeType,
            'Content-Length': end - start + 1,
            'Cache-Control': `public, max-age=${MAX_CACHE_AGE}, immutable`,
            'CDN-Cache-Control': `public, max-age=${MAX_CACHE_AGE}`,
            'CF-Cache-Tag': `video-${publicId}-part${part}`,
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // 2.3 Default - Trả về metadata
      return new Response(JSON.stringify({
        size: metadata.size,
        mimeType: metadata.mimeType,
        parts: Math.ceil(metadata.size / PART_SIZE)
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=86400'
        }
      });
    }

    // 3. Các file khác - Download trực tiếp
    const fileStream = await downloadFile(driveId);
    return new Response(fileStream, {
      status: 200,
      headers: {
        'Content-Type': metadata.mimeType,
        'Content-Length': metadata.size,
        'Content-Disposition': 'attachment',
        'Cache-Control': `public, max-age=${MAX_CACHE_AGE}, immutable`,
        'CDN-Cache-Control': `public, max-age=${MAX_CACHE_AGE}`,
        'CF-Cache-Tag': `file-${publicId}`,
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response('Server Error', { status: 500 });
  }
} 