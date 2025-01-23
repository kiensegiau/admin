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
    const MAX_CHUNK_SIZE = 15 * 1024 * 1024; // Giới hạn max 15MB mỗi response
    const TOTAL_CHUNKS = Math.ceil(metadata.size / CHUNK_SIZE);

    // Tạo ETag duy nhất cho video và version
    const VERSION = "v5"; // Tăng version khi thay đổi logic cache
    const videoETag = `"${VERSION}-${driveId}-${metadata.size}"`;

    // Headers cơ bản
    const responseHeaders = {
      "Content-Type": metadata.mimeType,
      "Accept-Ranges": "bytes",
      // Headers cho CORS
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Expose-Headers":
        "Content-Length, Content-Range, Content-Type, Accept-Ranges, Cache-Control",
      // Headers cho cache validation
      ETag: videoETag,
      "Last-Modified": new Date().toUTCString(),
      // Headers đặc biệt cho Cloudflare
      "CF-Edge-Cache": "cache-all",
      Vary: "Range, Accept-Encoding",
      // Thêm header để debug
      "X-Total-Chunks": TOTAL_CHUNKS.toString(),
      "X-Chunk-Size": CHUNK_SIZE.toString(),
      "X-Max-Chunk-Size": MAX_CHUNK_SIZE.toString(),
    };

    // Hàm tạo cache key cho Cloudflare
    function generateCacheKey(publicId, chunkIndex) {
      return `${VERSION}-${publicId}-chunk-${chunkIndex}`;
    }

    // Hàm tính chunk index từ byte position
    function getChunkIndexFromPosition(position) {
      return Math.floor(position / CHUNK_SIZE);
    }

    // Hàm tính byte range cho chunk
    function getChunkRange(chunkIndex) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE - 1, metadata.size - 1);
      return { start, end };
    }

    // Hàm tính toán range tối ưu
    function getOptimalRange(start, requestedEnd, currentChunk) {
      const { end: chunkEnd } = getChunkRange(currentChunk);
      let actualEnd = Math.min(requestedEnd, chunkEnd);

      // Nếu là seek request hoặc gần cuối chunk
      const remainingInChunk = chunkEnd - start + 1;
      const isNearChunkBoundary = remainingInChunk < CHUNK_SIZE * 0.2;
      const isSeekRequest =
        !requestedEnd || requestedEnd - start > CHUNK_SIZE * 2;

      if (isNearChunkBoundary || isSeekRequest) {
        // Tính toán kích thước tối ưu cho chunk tiếp theo
        const nextChunkSize = Math.min(
          MAX_CHUNK_SIZE - remainingInChunk, // Không vượt quá max size
          CHUNK_SIZE // Hoặc một chunk chuẩn
        );
        actualEnd = Math.min(start + nextChunkSize - 1, metadata.size - 1);
      }

      return {
        start,
        end: actualEnd,
        includesNextChunk: actualEnd > chunkEnd,
      };
    }

    let status = 200;
    const options = {};

    // Xử lý range request
    if (rangeHeader) {
      const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (matches) {
        const start = parseInt(matches[1]);
        const requestedEnd = matches[2]
          ? parseInt(matches[2])
          : metadata.size - 1;

        // Kiểm tra range hợp lệ
        if (
          start >= metadata.size ||
          requestedEnd >= metadata.size ||
          start > requestedEnd
        ) {
          return new Response("Range Not Satisfiable", {
            status: 416,
            headers: {
              "Content-Range": `bytes */${metadata.size}`,
              "Cache-Control": "no-store, no-cache, must-revalidate",
              "CDN-Cache-Control": "no-store",
            },
          });
        }

        // Tính toán chunk hiện tại
        const currentChunk = getChunkIndexFromPosition(start);
        const {
          start: actualStart,
          end: actualEnd,
          includesNextChunk,
        } = getOptimalRange(start, requestedEnd, currentChunk);

        // Set range headers
        options.range = `bytes=${actualStart}-${actualEnd}`;
        responseHeaders[
          "Content-Range"
        ] = `bytes ${actualStart}-${actualEnd}/${metadata.size}`;
        responseHeaders["Content-Length"] = (
          actualEnd -
          actualStart +
          1
        ).toString();

        // Cache Control headers
        const cacheableTags = [generateCacheKey(publicId, currentChunk)];
        if (includesNextChunk) {
          cacheableTags.push(generateCacheKey(publicId, currentChunk + 1));
        }

        // Cache tất cả chunks 30 ngày
        const maxAge = 2592000; // 30 days

        responseHeaders[
          "Cache-Control"
        ] = `public, max-age=${maxAge}, stale-while-revalidate=86400, immutable`;
        responseHeaders["CDN-Cache-Control"] = `public, max-age=${maxAge}`;
        responseHeaders["CF-Cache-Tags"] = cacheableTags.join(",");
        responseHeaders["CF-Cache-Key"] = generateCacheKey(
          publicId,
          currentChunk
        );
        responseHeaders["CF-Edge-Cache-TTL"] = maxAge.toString();

        // Debug headers
        responseHeaders["X-Current-Chunk"] = currentChunk.toString();
        responseHeaders["X-Original-Range"] = `${start}-${requestedEnd}`;
        responseHeaders["X-Serving-Range"] = `${actualStart}-${actualEnd}`;
        responseHeaders["X-Response-Size"] = `${(
          (actualEnd - actualStart + 1) /
          1024 /
          1024
        ).toFixed(1)}MB`;
        responseHeaders["X-Optimization"] = includesNextChunk
          ? "next-chunk-included"
          : "current-chunk-only";

        console.log("Serving chunk:", {
          originalRange: `${start}-${requestedEnd}`,
          servingRange: `${actualStart}-${actualEnd}`,
          size: `${((actualEnd - actualStart + 1) / 1024 / 1024).toFixed(1)}MB`,
          chunk: currentChunk,
          includesNextChunk,
          totalChunks: TOTAL_CHUNKS,
          cacheKey: responseHeaders["CF-Cache-Key"],
          progress: `${(((currentChunk + 1) / TOTAL_CHUNKS) * 100).toFixed(
            1
          )}%`,
          optimization: responseHeaders["X-Optimization"],
          cacheDuration: `${maxAge / 3600}h`,
        });

        status = 206;
      }
    } else {
      // Nếu không có range, trả về chunk đầu tiên và chunk thứ hai
      const firstChunk = getChunkRange(0);
      const secondChunk = getChunkRange(1);
      const end = secondChunk.end;

      // Cache chunk đầu tiên và thứ hai
      const cacheableTags = [
        generateCacheKey(publicId, 0),
        generateCacheKey(publicId, 1),
      ];

      responseHeaders["Cache-Control"] =
        "public, max-age=2592000, stale-while-revalidate=86400, immutable";
      responseHeaders["CDN-Cache-Control"] = "public, max-age=2592000"; // 30 ngày
      responseHeaders["CF-Cache-Tags"] = cacheableTags.join(",");
      responseHeaders["CF-Cache-Key"] = generateCacheKey(publicId, 0);
      responseHeaders["CF-Edge-Cache-TTL"] = "2592000";
      responseHeaders["Content-Length"] = (end + 1).toString();

      // Set range cho hai chunk đầu tiên
      options.range = `bytes=0-${end}`;

      console.log("Serving initial chunks:", {
        range: `0-${end}`,
        size: `${((end + 1) / 1024 / 1024).toFixed(1)}MB`,
        chunks: [0, 1],
        totalChunks: TOTAL_CHUNKS,
        cacheKey: responseHeaders["CF-Cache-Key"],
        cacheDuration: "30d",
      });
    }

    // Xử lý yêu cầu HEAD để lấy siêu dữ liệu video
    if (request.method === "HEAD") {
      return new Response(null, {
        status: 200,
        headers: responseHeaders,
      });
    }

    // Tải chunk từ Google Drive
    try {
      const { stream } = await downloadFile(driveId, options, tokens);
      return new Response(stream, {
        status,
        headers: responseHeaders,
      });
    } catch (error) {
      // Xử lý lỗi AbortError - không cần log
      if (error.name === "AbortError") {
        return new Response("Request aborted", { status: 499 }); // Client Closed Request
      }
      throw error; // Ném lại các lỗi khác
    }
  } catch (error) {
    console.error("Error in GET request:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
