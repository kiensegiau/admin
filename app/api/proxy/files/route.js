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
      mimeType: metadata.mimeType
    });

    // Stream toàn bộ file
    const stream = await downloadFile(driveId, {}, tokens);
    
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": metadata.mimeType,
        "Content-Length": metadata.size.toString(),
        "Cache-Control": "public, max-age=86400",
      }
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack 
      }), 
      { status: 500 }
    );
  }
}
