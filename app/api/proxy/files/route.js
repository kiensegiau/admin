export const dynamic = "force-dynamic";

import { decryptId } from "@/lib/encryption";
import { getValidTokens } from "@/lib/tokenStorage";
import { getFileMetadata, downloadFile } from "@/lib/drive";

let activeRequests = new Map();

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get("id");
    const rangeHeader = request.headers.get("range");

    // Tạo key duy nhất cho video và range
    const requestKey = `${publicId}-${rangeHeader || "full"}`;

    console.log("Request mới:", {
      key: requestKey,
      activeRequests: activeRequests.size,
      range: rangeHeader,
    });

    // Hủy các requests cũ
    for (let [key, oldStream] of activeRequests) {
      if (key.startsWith(publicId)) {
        try {
          console.log("Đang hủy request cũ:", key);
          if (oldStream.destroy) {
            oldStream.destroy();
            console.log("Đã hủy stream:", key);
          }
        } catch (error) {
          console.error("Lỗi khi hủy stream:", error);
        }
      }
    }

    if (!publicId) {
      return new Response("Missing file ID", { status: 400 });
    }

    // Lấy token hợp lệ
    const tokens = await getValidTokens();
    if (!tokens) {
      return new Response("Unauthorized - Token invalid", { status: 401 });
    }

    const driveId = decryptId(publicId);
    const metadata = await getFileMetadata(driveId, tokens);

    console.log("Streaming full video:", {
      name: metadata.name,
      size: metadata.size,
      mimeType: metadata.mimeType,
    });

    const stream = await downloadFile(driveId, {}, tokens);
    activeRequests.set(requestKey, stream);

    // Cleanup khi stream kết thúc hoặc lỗi
    stream.on("end", () => {
      console.log("Stream kết thúc:", requestKey);
      activeRequests.delete(requestKey);
    });

    stream.on("error", (error) => {
      console.log("Stream lỗi:", requestKey, error);
      activeRequests.delete(requestKey);
    });

    // Log để xem server đang tải bao nhiêu
    console.log("Server đang tải:", {
      fileSize: metadata.size,
      fileName: metadata.name,
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": metadata.mimeType,
        "Content-Length": metadata.size.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=2592000",
        "CDN-Cache-Control": "public, max-age=2592000",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
      { status: 500 }
    );
  }
}
