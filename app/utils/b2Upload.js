import B2 from "b2-sdk";

const b2 = new B2({
  applicationKeyId: process.env.B2_APPLICATION_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});

export const uploadToB2 = async (file, path, progressCallback) => {
  try {
    await b2.authorize();

    const { uploadUrl, authorizationToken } = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID,
    });

    const fileName = `${path}/${file.name}`;
    const fileInfo = await b2.uploadFile({
      uploadUrl: uploadUrl,
      uploadAuthToken: authorizationToken,
      fileName: fileName,
      data: file,
      onUploadProgress: (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          progressCallback(progress);
        }
      },
    });

    return fileInfo.fileId;
  } catch (error) {
    console.error("Lỗi khi tải lên Backblaze B2:", error);
    throw error;
  }
};
