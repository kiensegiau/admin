import { NextResponse } from "next/server";
import { HelvidUploader } from "../helvid-uploader/route";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    console.log("\n=== Bắt đầu test upload bằng URL ===");
    const { videoUrl } = await request.json();

    if (!videoUrl) {
      return NextResponse.json(
        { error: "URL video không được để trống" },
        { status: 400 }
      );
    }

    console.log("Video URL:", videoUrl);

    // Upload trực tiếp từ URL Drive lên Helvid sử dụng HelvidUploader
    console.log("Bắt đầu upload lên Helvid bằng URL...");
    const uploader = new HelvidUploader();
    const result = await uploader.uploadFromDrive(videoUrl);

    if (!result.success) {
      throw new Error(
        "Upload thất bại: " + (result.error || "Lỗi không xác định")
      );
    }

    console.log("Upload thành công:", result);
    console.log("=== Kết thúc test upload bằng URL ===\n");

    return NextResponse.json(result);
  } catch (error) {
    console.error("Lỗi trong quá trình xử lý:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi xử lý video",
      },
      { status: 500 }
    );
  }
}
