import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY,
  },
});

// Thêm đoạn code sau để kiểm tra thông tin xác thực
console.log('R2 Credentials:', {
  accountId: process.env.NEXT_PUBLIC_R2_ACCOUNT_ID,
  accessKeyId: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY ? '******' : 'Not set'
});

export const uploadToR2 = async (file, courseName, chapterName, lessonName) => {
  try {
    console.log('Uploading to R2 with params:', {
      Bucket: process.env.R2_BUCKET_NAME,
      AccountID: process.env.R2_ACCOUNT_ID,
      AccessKeyID: process.env.R2_ACCESS_KEY_ID.substring(0, 5) + '...',
      FilePath: `khoa-hoc/${courseName}/${chapterName}/${lessonName}/${file.name}`
    });

    const filePath = `khoa-hoc/${courseName}/${chapterName}/${lessonName}/${file.name}`;
    const fileContent = await file.arrayBuffer();

    const params = {
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filePath,
      Body: Buffer.from(fileContent),
      ContentType: file.type,
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const downloadUrl = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET_NAME}/${encodeURIComponent(filePath)}`;
    return { fileId: filePath, downloadUrl };
  } catch (error) {
    console.error("Lỗi chi tiết khi tải lên Cloudflare R2:", error);
    throw new Error(`Lỗi khi tải lên Cloudflare R2: ${error.message}`);
  }
};

export const uploadToR2MultiPart = async (content, key, courseName, chapterName, lessonName) => {
  try {
    console.log('Uploading to R2 with multipart:', {
      Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME,
      Key: key,
    });

    const params = {
      Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: 'video/MP2T',
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    const downloadUrl = `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.NEXT_PUBLIC_R2_BUCKET_NAME}/${encodeURIComponent(key)}`;
    return { fileId: key, downloadUrl };
  } catch (error) {
    console.error("Lỗi chi tiết khi tải lên Cloudflare R2 (multipart):", error);
    throw new Error(`Lỗi khi tải lên Cloudflare R2 (multipart): ${error.message}`);
  }
};