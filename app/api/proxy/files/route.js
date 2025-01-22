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
    
    // Kích thước chunk cố định cho toàn bộ video
    const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB mỗi chunk

    // Tạo ETag duy nhất cho video
    const videoETag = `"${driveId}-${metadata.size}"`;

    // Headers cơ bản
    const responseHeaders = {
      "Content-Type": metadata.mimeType,
      "Accept-Ranges": "bytes",
      // Headers cho CORS
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Content-Type, Accept-Ranges, Cache-Control",
      // Headers cho cache validation
      "ETag": videoETag,
      "Last-Modified": new Date().toUTCString(),
      // Headers đặc biệt cho Cloudflare
      "CF-Edge-Cache": "cache-all",
      "Vary": "Range, Accept-Encoding"
    };

    // Hàm tạo cache key cho Cloudflare
    function generateCacheKey(publicId, chunkIndex) {
      return `v2-${publicId}-chunk-${chunkIndex}`;
    }

    let status = 200;
    const options = {};

    // Xử lý range request
    if (rangeHeader) {
      const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (matches) {
        const start = parseInt(matches[1]);
        const requestedEnd = matches[2] ? parseInt(matches[2]) : metadata.size - 1;
        
        // Kiểm tra range hợp lệ
        if (start >= metadata.size || requestedEnd >= metadata.size || start > requestedEnd) {
          return new Response("Range Not Satisfiable", { 
            status: 416,
            headers: {
              "Content-Range": `bytes */${metadata.size}`,
              "Cache-Control": "no-store, no-cache, must-revalidate",
              "CDN-Cache-Control": "no-store"
            }
          });
        }

        // Tính toán chunks cần thiết
        const startChunk = Math.floor(start / CHUNK_SIZE);
        const endChunk = Math.floor(requestedEnd / CHUNK_SIZE);
        
        // Nếu request yêu cầu nhiều chunks, chỉ trả về chunk đầu tiên
        let end;
        if (!matches[2] || (requestedEnd - start) > CHUNK_SIZE * 2) {
          // Trả về chunk đầu tiên được yêu cầu
          end = Math.min(start + CHUNK_SIZE - (start % CHUNK_SIZE) - 1, metadata.size - 1);
        } else {
          end = requestedEnd;
        }

        // Luôn cache mọi chunk
        const cacheableTags = [];
        const currentChunk = Math.floor(start / CHUNK_SIZE);
        cacheableTags.push(generateCacheKey(publicId, currentChunk));

        // Cache Control headers
        responseHeaders["Cache-Control"] = "public, max-age=604800, stale-while-revalidate=86400, immutable";
        responseHeaders["CDN-Cache-Control"] = "public, max-age=604800"; // 7 ngày
        responseHeaders["CF-Cache-Tags"] = cacheableTags.join(",");
        responseHeaders["CF-Cache-Key"] = generateCacheKey(publicId, currentChunk);
        responseHeaders["CF-Edge-Cache-TTL"] = "604800";
        
        // Set range headers
        options.range = `bytes=${start}-${end}`;
        responseHeaders["Content-Range"] = `bytes ${start}-${end}/${metadata.size}`;
        responseHeaders["Content-Length"] = (end - start + 1).toString();
        
        console.log("Serving chunk:", {
          originalRange: `${start}-${requestedEnd}`,
          servingRange: `${start}-${end}`,
          size: `${((end - start + 1) / 1024 / 1024).toFixed(1)}MB`,
          chunk: currentChunk,
          totalChunks: Math.ceil(metadata.size / CHUNK_SIZE),
          cacheKey: responseHeaders["CF-Cache-Key"]
        });
        
        status = 206;
      }
    } else {
      // Nếu không có range, trả về chunk đầu tiên
      const end = Math.min(CHUNK_SIZE - 1, metadata.size - 1);
      
      // Cache chunk đầu tiên
      const cacheableTags = [generateCacheKey(publicId, 0)];
      
      responseHeaders["Cache-Control"] = "public, max-age=604800, stale-while-revalidate=86400, immutable";
      responseHeaders["CDN-Cache-Control"] = "public, max-age=604800";
      responseHeaders["CF-Cache-Tags"] = cacheableTags.join(",");
      responseHeaders["CF-Cache-Key"] = generateCacheKey(publicId, 0);
      responseHeaders["CF-Edge-Cache-TTL"] = "604800";
      responseHeaders["Content-Length"] = (end + 1).toString();
      
      // Set range cho chunk đầu tiên
      options.range = `bytes=0-${end}`;
      
      console.log("Serving first chunk:", {
        range: `0-${end}`,
        size: `${((end + 1) / 1024 / 1024).toFixed(1)}MB`,
        chunk: 0,
        totalChunks: Math.ceil(metadata.size / CHUNK_SIZE),
        cacheKey: responseHeaders["CF-Cache-Key"]
      });
    }

    // Tải chunk từ Google Drive
    const { stream } = await downloadFile(driveId, options, tokens);

    return new Response(stream, {
      status,
      headers: responseHeaders
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
