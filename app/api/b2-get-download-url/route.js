import { NextResponse } from "next/server";
import B2 from "backblaze-b2";

export async function POST(req) {
  try {
    const { fileId } = await req.json();
    console.log("FileId nhận được:", fileId);

    const b2 = new B2({
      applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
      applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
    });

    console.log("Đang xác thực B2...");
    await b2.authorize();
    console.log("Đã xác thực B2 thành công");

    console.log("Đang lấy thông tin file...");
    const fileInfo = await b2.getFileInfo({ fileId });
    console.log("Thông tin file từ B2:", fileInfo.data);

    if (!fileInfo.data || !fileInfo.data.fileName) {
      throw new Error("Không tìm thấy thông tin file trong phản hồi từ B2");
    }

    console.log("Đang lấy authorization...");
    const response = await b2.getDownloadAuthorization({
      bucketId: process.env.NEXT_PUBLIC_B2_BUCKET_ID,
      fileNamePrefix: fileInfo.data.fileName,
      validDurationInSeconds: 3600,
    });

    console.log("Thông tin authorization từ B2:", response.data);

    if (!response.data || !response.data.authorizationToken) {
      throw new Error("Không tìm thấy authorization token trong phản hồi từ B2");
    }

    const downloadUrl = `https://f005.backblazeb2.com/file/${process.env.NEXT_PUBLIC_B2_BUCKET_NAME}/${encodeURIComponent(fileInfo.data.fileName)}?Authorization=${response.data.authorizationToken}`;
    console.log("URL tải xuống được tạo:", downloadUrl);

    return NextResponse.json({ downloadUrl });
  } catch (error) {
    console.error("Lỗi chi tiết khi lấy URL tải xuống từ B2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
