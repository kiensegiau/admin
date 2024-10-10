import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY,
  },
});

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  
  console.log("Khóa được yêu cầu:", key);

  if (!key) {
    console.error("Lỗi: Thiếu tham số khóa");
    return NextResponse.json({ error: "Thiếu tham số khóa" }, { status: 400 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME,
      Key: key,
    });

    console.log("Đang tạo URL đã ký...");
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    
    console.log("URL đã xử lý:", signedUrl);

    const response = await fetch(signedUrl);
    const contentType = response.headers.get('content-type');
    
    if (key.endsWith('.ts')) {
      const arrayBuffer = await response.arrayBuffer();
      return new NextResponse(Buffer.from(arrayBuffer), {
        headers: {
          'Content-Type': 'video/MP2T',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    let data = await response.text();

    if (contentType.includes('application/x-mpegURL') || contentType.includes('application/vnd.apple.mpegurl')) {
      console.log('Nội dung m3u8 gốc:', data);
      const lines = data.split('\n');
      const processedLines = lines.map(line => {
        if (!line.startsWith('#') && line.trim() !== '') {
          return `/api/r2-proxy?key=${encodeURIComponent(key.split('/').slice(0, -1).concat(line.trim()).join('/'))}`;
        }
        return line;
      });
      data = processedLines.join('\n');
      console.log("Nội dung m3u8 đã xử lý:", data);
    }

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error("Lỗi khi xử lý yêu cầu:", error);
    return NextResponse.json({ error: "Không thể xử lý yêu cầu" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
