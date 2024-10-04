import B2 from 'backblaze-b2';

const b2 = new B2({
  applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
  applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
  axios: {
    validateStatus: () => true, // Bỏ qua kiểm tra trạng thái
  }
});

export const authorizeB2 = async () => {
  try {
    const response = await fetch('/api/b2-authorize', { method: 'POST' });
    return await response.json();
  } catch (error) {
    console.error('Lỗi khi xác thực B2:', error);
    throw error;
  }
};

export const uploadToB2 = async (file, courseName, chapterName, lessonName) => {
  try {
    await authorizeB2();
    
    const uploadUrlResponse = await fetch('/api/b2-get-upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: process.env.NEXT_PUBLIC_B2_BUCKET_ID }),
    });
    const { uploadUrl, authorizationToken } = await uploadUrlResponse.json();

    const sanitizeString = (str) => str?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'unknown';

    const filePath = `khoa-hoc/${courseName}/${chapterName}/${lessonName}/${file.name}`;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', filePath);
    formData.append('uploadUrl', uploadUrl);
    formData.append('authorizationToken', authorizationToken);

    const response = await fetch('/api/b2-upload-file', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const fileInfo = await response.json();
    return fileInfo.fileId;

  } catch (error) {
    console.error("Lỗi chi tiết khi tải lên Backblaze B2:", error);
    throw new Error(`Lỗi khi tải lên Backblaze B2: ${error.message}`);
  }
};