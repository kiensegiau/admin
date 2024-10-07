import aws4 from 'aws4';

export async function uploadToR2Direct(file, courseName, chapterName, lessonName) {
  const fileName = `${courseName}/${chapterName}/${lessonName}/${file.name}`;
  const url = `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.NEXT_PUBLIC_R2_BUCKET_NAME}/${fileName}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const request = {
    method: 'PUT',
    host: `${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path: `/${process.env.NEXT_PUBLIC_R2_BUCKET_NAME}/${fileName}`,
    headers: {
      'Content-Type': file.type,
    },
    body: buffer,
  };

  const signedRequest = aws4.sign(request, {
    accessKeyId: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY,
  });

  const response = await fetch(url, {
    method: signedRequest.method,
    headers: signedRequest.headers,
    body: buffer,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}, body: ${await response.text()}`);
  }

  return {
    fileId: fileName,
    downloadUrl: url,
  };
}

export async function testR2Connection() {
  const testFile = new File(['Hello R2'], 'test.txt', { type: 'text/plain' });
  try {
    const result = await uploadToR2Direct(testFile, 'test-course', 'test-chapter', 'test-lesson');
    console.log('Kết nối R2 thành công:', result);
    return true;
  } catch (error) {
    console.error('Lỗi kết nối R2:', error);
    return false;
  }
}
