import B2 from 'backblaze-b2';

const b2 = new B2({
  applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
  applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
});

export const uploadToB2 = async (file, courseName, chapterName, lessonName) => {
  try {
    console.log('Authorizing B2...');
    const authResponse = await b2.authorize();
    console.log('B2 Authorization:', authResponse);
    
    console.log('Getting upload URL...');
    const { data: { uploadUrl, authorizationToken } } = await b2.getUploadUrl({
      bucketId: process.env.NEXT_PUBLIC_B2_BUCKET_ID,
    });
    console.log('Upload URL:', uploadUrl);

    const filePath = `khoa-hoc/${courseName}/${chapterName}/${lessonName}/${file.name}`;
    console.log('File Path:', filePath);

    const fileContent = await file.arrayBuffer();
    const buffer = Buffer.from(fileContent);
    
    console.log('Uploading file...');
    const { data: fileInfo } = await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: filePath,
      data: buffer,
      contentType: file.type,
    });
    console.log('File Info:', fileInfo);

    const downloadUrl = `https://f005.backblazeb2.com/file/${process.env.NEXT_PUBLIC_B2_BUCKET_NAME}/${encodeURIComponent(filePath)}`;
    return { fileId: fileInfo.fileId, downloadUrl };
  } catch (error) {
    console.error("Lỗi chi tiết khi tải lên Backblaze B2:", error);
    throw new Error(`Lỗi khi tải lên Backblaze B2: ${error.message}`);
  }
};