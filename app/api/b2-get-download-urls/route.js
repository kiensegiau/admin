import { NextResponse } from "next/server";
import B2 from "backblaze-b2";

export async function POST(req) {
  try {
    const { fileIds } = await req.json();
    console.log("FileIds nhận được:", fileIds);

    const b2 = new B2({
      applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
      applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
    });

    await b2.authorize();
    console.log("Đã xác thực B2 thành công");

    const authenticatedUrls = {};

    for (const fileId of fileIds) {
      const fileInfo = await b2.getFileInfo({ fileId });
      console.log("Thông tin file từ B2:", fileInfo.data);

      if (!fileInfo.data || !fileInfo.data.fileName) {
        console.error(`Không tìm thấy thông tin cho fileId: ${fileId}`);
        continue;
      }

      const response = await b2.getDownloadAuthorization({
        bucketId: process.env.NEXT_PUBLIC_B2_BUCKET_ID,
        fileNamePrefix: fileInfo.data.fileName,
        validDurationInSeconds: 3600,
      });

      if (!response.data || !response.data.authorizationToken) {
        console.error(`Không tìm thấy authorization token cho fileId: ${fileId}`);
        continue;
      }

      const downloadUrl = `https://f005.backblazeb2.com/file/${process.env.NEXT_PUBLIC_B2_BUCKET_NAME}/${encodeURIComponent(fileInfo.data.fileName)}?Authorization=${response.data.authorizationToken}`;
      authenticatedUrls[fileId] = downloadUrl;
    }

    console.log("URLs xác thực đã được tạo:", authenticatedUrls);
    return NextResponse.json(authenticatedUrls);
  } catch (error) {
    console.error("Lỗi khi lấy URL tải xuống từ B2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}