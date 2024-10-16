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

// Hàm uploadToR2Direct: Tải lên file lên Cloudflare R2 storage
export async function uploadToR2Direct(file, courseName, chapterName, lessonName) {
  const key = file.name; // Sử dụng key đầy đủ đã được tạo trước đó
  
  // Xử lý nội dung file
  let fileContent;
  if (file instanceof File) {
    // Nếu là đối tượng File, chuyển đổi thành Buffer
    fileContent = Buffer.from(await file.arrayBuffer());
  } else if (file instanceof Buffer) {
    // Nếu đã là Buffer, sử dụng trực tiếp
    fileContent = file;
  } else {
    // Nếu không phải File hoặc Buffer, ném lỗi
    throw new Error('Loại file không được hỗ trợ');
  }

  // Tạo lệnh PutObject để tải lên R2
  const command = new PutObjectCommand({
    Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME, // Tên bucket R2
    Key: key, // Key của file trên R2
    Body: fileContent, // Nội dung file
    ContentType: file.type, // Loại nội dung của file
  });

  try {
    // Gửi lệnh tải lên đến R2
    await s3Client.send(command);
    console.log(`File đã được tải lên thành công tới ${key}`);
    // Trả về thông tin file đã tải lên
    return { 
      fileId: key, 
      downloadUrl: `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.NEXT_PUBLIC_R2_BUCKET_NAME}/${key}` 
    };
  } catch (error) {
    // Xử lý lỗi nếu có
    console.error('Chi tiết lỗi khi tải lên R2:', error);
    throw error;
  }
}

// Hàm testR2Connection: Kiểm tra kết nối với R2
export async function testR2Connection() {
  // Tạo một file test
  const testFile = new File(['Hello R2'], 'test.txt', { type: 'text/plain' });
  try {
    // Thử tải lên file test
    const result = await uploadToR2Direct(testFile, 'test-course', 'test-chapter', 'test-lesson');
    console.log('Kết nối R2 thành công:', result);
    return true;
  } catch (error) {
    // Xử lý lỗi nếu có
    console.error('Lỗi kết nối R2:', error);
    return false;
  }
}

// Xuất client R2 để sử dụng ở nơi khác trong ứng dụng
export const r2Client = s3Client;
