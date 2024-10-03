import B2 from 'backblaze-b2';

const b2 = new B2({
  applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
  applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
  axios: {
    validateStatus: () => true, // Bỏ qua kiểm tra trạng thái
  }
});

export const authorizeB2 = async () => {
  console.log('Bắt đầu xác thực B2');
  try {
    const response = await fetch('/api/b2-authorize', {
      method: 'POST',
    });
    const data = await response.json();
    console.log('Xác thực B2 thành công:', data);
    return data;
  } catch (error) {
    console.error('Lỗi khi xác thực B2:', error);
    throw error;
  }
};

export const uploadToB2 = async (file, path, progressCallback) => {
  try {
    console.log('Bắt đầu tải lên B2');
    const authResponse = await authorizeB2();
    console.log('Đã xác thực B2, nhận được response:', authResponse);
    
    console.log('Đang lấy URL tải lên');
    const uploadUrlResponse = await fetch('/api/b2-get-upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bucketId: process.env.NEXT_PUBLIC_B2_BUCKET_ID }),
    });
    const { uploadUrl, authorizationToken } = await uploadUrlResponse.json();
    console.log('Đã nhận được URL tải lên:', uploadUrl);

    const fileName = `${path}/${file.name}`;
    console.log('Bắt đầu tải file lên B2:', fileName);

    // Thay đổi phần này để sử dụng API route
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileName', fileName);
    formData.append('uploadUrl', uploadUrl);
    formData.append('authorizationToken', authorizationToken);

    const uploadResponse = await fetch('/api/b2-upload-file', {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`HTTP error! status: ${uploadResponse.status}`);
    }

    const fileInfo = await uploadResponse.json();
    console.log('Tải file lên B2 thành công:', fileInfo);

    return fileInfo.fileId;
  } catch (error) {
    console.error("Lỗi chi tiết khi tải lên Backblaze B2:", error);
    throw new Error(`Lỗi khi tải lên Backblaze B2: ${error.message}`);
  }
};
