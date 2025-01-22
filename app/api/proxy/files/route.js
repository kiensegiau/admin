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
        activeRequests.delete(key);
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
    
    const options = {};
    let status = 200;
    const responseHeaders = {
      "Content-Type": metadata.mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=2592000, immutable, stale-while-revalidate=86400",
      "CDN-Cache-Control": "public, max-age=2592000",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type",
      "Vary": "Range"
    };

    // Xử lý range request
    if (rangeHeader) {
      const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (matches) {
        const start = parseInt(matches[1]);
        const end = matches[2] ? parseInt(matches[2]) : metadata.size - 1;
        
        // Kiểm tra range hợp lệ
        if (start >= metadata.size || end >= metadata.size || start > end) {
          return new Response("Range Not Satisfiable", { 
            status: 416,
            headers: {
              "Content-Range": `bytes */${metadata.size}`
            }
          });
        }
        
        options.range = `bytes=${start}-${end}`;
        status = 206;
        
        responseHeaders["Content-Range"] = `bytes ${start}-${end}/${metadata.size}`;
        responseHeaders["Content-Length"] = (end - start + 1).toString();
      }
    } else {
      responseHeaders["Content-Length"] = metadata.size.toString();
    }

    console.log("Streaming video:", {
      name: metadata.name,
      size: metadata.size,
      mimeType: metadata.mimeType,
      range: options.range,
      status
    });

    const { stream, headers } = await downloadFile(driveId, options, tokens);
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

    // Merge headers từ Google Drive nếu cần
    if (headers["content-type"]) {
      responseHeaders["Content-Type"] = headers["content-type"];
    }

    return new Response(stream, {
      status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error("Error:", error);
    if (error.message.includes("range")) {
      return new Response("Range Not Satisfiable", { status: 416 });
    }
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
      { status: 500 }
    );
  }
}
