import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export const uploadToR2 = async (file, courseName, chapterName, lessonName) => {
  try {
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