import B2 from 'backblaze-b2';

const b2 = new B2({
  applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
  applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
});

export const uploadToB2 = async (file, courseName, chapterName, lessonName) => {
  try {
    await b2.authorize();
    
    const { data: { uploadUrl, authorizationToken } } = await b2.getUploadUrl({
      bucketId: process.env.NEXT_PUBLIC_B2_BUCKET_ID,
    });

    const filePath = `khoa-hoc/${courseName}/${chapterName}/${lessonName}/${file.name}`;
    const fileContent = await file.arrayBuffer();
    const buffer = Buffer.from(fileContent);
    
    const { data: fileInfo } = await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: filePath,
      data: buffer,
      contentType: file.type,
    });

    const downloadUrl = `https://f005.backblazeb2.com/file/${process.env.NEXT_PUBLIC_B2_BUCKET_NAME}/${encodeURIComponent(filePath)}`;
    return { fileId: fileInfo.fileId, downloadUrl };
  } catch (error) {
    console.error("Lỗi chi tiết khi tải lên Backblaze B2:", error);
    throw new Error(`Lỗi khi tải lên Backblaze B2: ${error.message}`);
  }
};