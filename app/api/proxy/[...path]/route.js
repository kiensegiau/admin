// lib/proxy.js

import { getFileMetadata, downloadFile, updateFile, deleteFile } from '../../../../lib/drive';
import { authenticateToken, authorize, getAccessToken } from '../../../../lib/auth';
import { logRequest, logError } from '../../../../lib/logging';
import { encryptId, decryptId } from '@/lib/encryption';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const publicId = searchParams.get('id');

  if (!publicId) {
    return new Response('Missing required parameters', { status: 400 });
  }

  try {
    // Giải mã public ID để lấy drive ID
    const driveId = decryptId(publicId);
    if (!driveId) {
      return new Response('Invalid ID', { status: 400 });
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    const metadata = await getFileMetadata(driveId, accessToken);
    
    // Thay thế ID gốc bằng public ID trong metadata
    const publicMetadata = {
      ...metadata,
      id: publicId,
      webViewLink: `/api/proxy/files?id=${publicId}`
    };

    if (searchParams.get('metadata') === 'true') {
      return new Response(JSON.stringify({ metadata: publicMetadata }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fileStream = await downloadFile(driveId, accessToken);
    return new Response(fileStream, {
      status: 200,
      headers: {
        'Content-Type': metadata.mimeType,
        'Content-Disposition': `inline; filename="${metadata.name}"`,
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response('Internal Server Error', { status: 500 });
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