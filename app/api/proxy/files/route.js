import { decryptId } from "@/lib/encryption";
import { readTokens } from "@/lib/tokenStorage";
import { google } from "googleapis";
import { getFileMetadata, downloadFile } from "@/lib/drive";

const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB mỗi chunk

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const publicId = searchParams.get("id");
    const part = searchParams.get("part");
    const range = request.headers.get("range");

    console.log("Request:", { publicId, part, range });

    if (!publicId) {
      return new Response("Missing file ID", { status: 400 });
    }

    const driveId = decryptId(publicId);
    const tokens = readTokens();
    const metadata = await getFileMetadata(driveId, tokens);

    // Nếu có range header, ưu tiên xử lý range
    if (range) {
      const bytes = range.replace('bytes=', '').split('-');
      const start = parseInt(bytes[0]);
      const end = bytes[1] ? parseInt(bytes[1]) : Math.min(start + CHUNK_SIZE - 1, metadata.size - 1);

      console.log("Range request:", { start, end });

      const stream = await downloadFile(driveId, { start, end }, tokens);
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": metadata.mimeType,
          "Content-Range": `bytes ${start}-${end}/${metadata.size}`,
          "Content-Length": (end - start + 1).toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }

    // Nếu request part cụ thể
    if (part !== null) {
      const partNum = parseInt(part);
      const start = partNum * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE - 1, metadata.size - 1);

      // Nếu là part 0, trả về thêm một phần nhỏ của part 1 để đảm bảo player có đủ data
      if (partNum === 0) {
        const extraSize = 1024 * 1024; // 1MB extra
        const newEnd = Math.min(end + extraSize, metadata.size - 1);
        
        console.log("Streaming first chunk with extra:", { start, end: newEnd });
        
        const stream = await downloadFile(driveId, { start, end: newEnd }, tokens);
        return new Response(stream, {
          status: 206,
          headers: {
            "Content-Type": metadata.mimeType,
            "Content-Range": `bytes ${start}-${newEnd}/${metadata.size}`,
            "Content-Length": (newEnd - start + 1).toString(),
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=86400"
          }
        });
      }

      console.log("Streaming chunk:", { part: partNum, start, end });

      const stream = await downloadFile(driveId, { start, end }, tokens);
      return new Response(stream, {
        status: 206,
        headers: {
          "Content-Type": metadata.mimeType,
          "Content-Range": `bytes ${start}-${end}/${metadata.size}`,
          "Content-Length": (end - start + 1).toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=86400"
        }
      });
    }

    // Trả về metadata
    return new Response(
      JSON.stringify({
        id: publicId,
        name: metadata.name,
        size: metadata.size,
        mimeType: metadata.mimeType,
        duration: metadata.videoMediaMetadata?.durationMillis || 0,
        parts: Math.ceil(metadata.size / CHUNK_SIZE),
        chunkSize: CHUNK_SIZE
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=3600"
        }
      }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
