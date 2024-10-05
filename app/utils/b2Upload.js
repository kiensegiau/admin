import B2 from 'backblaze-b2';

const b2 = new B2({
  applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
  applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
  axios: {
    validateStatus: () => true, // Bỏ qua kiểm tra trạng thái
  }
});

export const uploadToB2 = async (file, courseName, chapterName, lessonName) => {
  try {
    console.log('Bắt đầu quá trình upload lên B2');
    
    await b2.authorize();
    console.log('Đã xác thực B2 thành công');
    
    console.log(`Đang upload file: ${file.name}`);
    const { data: { uploadUrl, authorizationToken } } = await b2.getUploadUrl({
      bucketId: process.env.NEXT_PUBLIC_B2_BUCKET_ID,
    });
    console.log(`Đã nhận được URL upload cho file ${file.name}`);
    const filePath = `khoa-hoc/${courseName}/${chapterName}/${lessonName}/${file.name}`;
    const fileContent = Buffer.from(await file.arrayBuffer());
    const { data: fileInfo } = await b2.uploadFile({
      uploadUrl: uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: filePath,
      data: fileContent,
      contentType: file.type,
    });

    console.log(`Upload thành công file ${file.name}, fileId: ${fileInfo.fileId}`);

    const downloadUrl = `https://f005.backblazeb2.com/file/${process.env.NEXT_PUBLIC_B2_BUCKET_NAME}/${encodeURIComponent(filePath)}`;
    console.log(`Download URL cho file ${file.name}: ${downloadUrl}`);
    console.error("Lỗi chi tiết khi tải lên Backblaze B2:", error);
    return { fileId: fileInfo.fileId, downloadUrl };
  } catch (error) {
    console.error("Lỗi chi tiết khi tải lên Backblaze B2:", error);
    throw new Error(`Lỗi khi tải lên Backblaze B2: ${error.message}`);
  }
};