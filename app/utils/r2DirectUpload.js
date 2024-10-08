import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY,
  },
});

export async function uploadToR2Direct(file, courseName, chapterName, lessonName) {
  const key = `khoa-hoc/${courseName}/${chapterName}/${lessonName}/${file.name}`;

  const command = new PutObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME,
    Key: key,
    ContentType: file.type,
  });

  try {
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    console.log('Signed URL:', signedUrl);

    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('R2 response:', response.status, errorText);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
    }

    return {
      fileId: key,
      downloadUrl: `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.NEXT_PUBLIC_R2_BUCKET_NAME}/${key}`,
    };
  } catch (error) {
    console.error('Chi tiết lỗi khi tải lên R2:', error);
    throw error;
  }
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
