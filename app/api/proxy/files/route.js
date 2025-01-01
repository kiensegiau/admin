import { decryptId } from "@/lib/encryption";
import { getValidTokens } from "@/lib/tokenStorage";
import { getFileMetadata, downloadFile } from "@/lib/drive";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get("id");

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

    console.log("Request từ browser:", {
      range: request.headers.get("range"),
      url: request.url,
    });

    // Stream toàn bộ file
    const stream = await downloadFile(driveId, {}, tokens);

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
        "Cache-Control": "public, max-age=2592000",
        "Accept-Ranges": "bytes",
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
