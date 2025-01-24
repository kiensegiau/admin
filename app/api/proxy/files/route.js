export const dynamic = "force-dynamic";

import { decryptId } from "@/lib/encryption";
import { getValidTokens } from "@/lib/tokenStorage";
import { getFileMetadata, downloadFile } from "@/lib/drive";
import { NextResponse } from "next/server";
import { createLogger, format, transports } from "winston";

let activeRequests = new Map();

const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// Constants for CORS and Cache configuration
const CORS_CONFIG = {
  ALLOWED_ORIGINS: [
    "http://localhost:3000",
    "https://localhost:3000",
    "http://admin.khoahoc.live",
    "https://admin.khoahoc.live",
    "http://khoahoc.live",
    "https://khoahoc.live",
  ],
  ALLOWED_METHODS: ["GET", "HEAD", "OPTIONS"],
  ALLOWED_HEADERS: [
    "Range",
    "Accept",
    "Accept-Encoding",
    "Content-Type",
    "Content-Length",
    "Authorization",
    "X-Requested-With",
    "Origin",
    "Cache-Control",
    "Pragma",
  ],
  EXPOSED_HEADERS: [
    "Content-Length",
    "Content-Range",
    "Content-Type",
    "Accept-Ranges",
    "Content-Encoding",
    "Cache-Control",
    "Expires",
    "Last-Modified",
    "CF-Cache-Status",
    "X-Chunk-Size",
    "X-Total-Chunks",
    "X-Current-Chunk",
    "X-Response-Size",
    "X-Optimization",
  ],
  MAX_AGE: "86400",
  CREDENTIALS: "true",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "X-XSS-Protection": "1; mode=block",
};

// Thêm hàm helper để log headers
function logHeaders(prefix, headers) {
  console.log(`${prefix} Headers:`, {
    ...Object.fromEntries(headers.entries()),
    raw: headers.raw ? Object.fromEntries(Object.entries(headers.raw())) : null,
  });
}

// Hàm tạo CORS headers
function getCorsHeaders(request) {
  const origin = request.headers.get("origin");

  console.log("[CORS] Request details:", {
    origin,
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    allowedOrigins: CORS_CONFIG.ALLOWED_ORIGINS,
    isOriginAllowed: CORS_CONFIG.ALLOWED_ORIGINS.includes(origin),
  });

  // Validate origin
  const validOrigin = CORS_CONFIG.ALLOWED_ORIGINS.includes(origin)
    ? origin
    : CORS_CONFIG.ALLOWED_ORIGINS[0];

  const corsHeaders = {
    "Access-Control-Allow-Origin": validOrigin,
    "Access-Control-Allow-Methods": CORS_CONFIG.ALLOWED_METHODS.join(", "),
    "Access-Control-Allow-Headers": CORS_CONFIG.ALLOWED_HEADERS.join(", "),
    "Access-Control-Allow-Credentials": CORS_CONFIG.CREDENTIALS,
    "Access-Control-Max-Age": CORS_CONFIG.MAX_AGE,
    "Access-Control-Expose-Headers": CORS_CONFIG.EXPOSED_HEADERS.join(", "),
    Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
  };

  console.log("[CORS] Generated headers:", corsHeaders);
  return corsHeaders;
}

// Hàm tạo response với CORS headers
function createCorsResponse(body, status = 200, customHeaders = {}, request) {
  const headers = new Headers(customHeaders);
  const corsHeaders = getCorsHeaders(request);

  // Add CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  // Add security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(body, { status, headers });
}

// Middleware để xử lý CORS
async function corsMiddleware(request, handler) {
  console.log("\n[CORS] ====== New Request ======");

  // Log chi tiết request
  const requestInfo = {
    method: request.method,
    url: request.url,
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    requestHeaders: Object.fromEntries(request.headers.entries()),
  };
  console.log("[CORS] Request details:", requestInfo);

  // Xử lý OPTIONS request
  if (request.method === "OPTIONS") {
    console.log("[CORS] Processing OPTIONS preflight request");

    const corsHeaders = getCorsHeaders(request);
    const headers = new Headers(corsHeaders);

    // Thêm security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      headers.set(key, value);
    });

    // Log response headers
    console.log(
      "[CORS] Preflight response headers:",
      Object.fromEntries(headers.entries())
    );

    return new Response(null, {
      status: 204,
      headers: headers,
    });
  }

  try {
    console.log("[CORS] Processing main request");
    const response = await handler(request);

    // Log response details
    console.log("[CORS] Handler response:", {
      status: response.status,
      statusText: response.statusText,
      type: response.type,
      responseHeaders: Object.fromEntries(response.headers.entries()),
    });

    const headers = new Headers(response.headers);
    const corsHeaders = getCorsHeaders(request);

    // Add CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      console.log(`[CORS] Setting header: ${key} = ${value}`);
      headers.set(key, value);
    });

    // Add security headers
    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      headers.set(key, value);
    });

    // Log final headers
    console.log(
      "[CORS] Final response headers:",
      Object.fromEntries(headers.entries())
    );

    return new Response(response.body, {
      status: response.status,
      headers: headers,
    });
  } catch (error) {
    console.error("[CORS] Error in handler:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    return createErrorResponse("Internal Server Error", 500, request);
  }
}

// Hàm tạo response lỗi với CORS headers
function createErrorResponse(errorMessage, errorCode = 500, request) {
  return createCorsResponse(
    JSON.stringify({ error: errorMessage }),
    errorCode,
    { "Content-Type": "application/json" },
    request
  );
}

export async function GET(request) {
  console.log("\n[GET] ====== Start Request ======");
  console.log("[GET] Request URL:", request.url);
  console.log(
    "[GET] Request headers:",
    Object.fromEntries(request.headers.entries())
  );

  return corsMiddleware(request, async (req) => {
    try {
      const { searchParams } = new URL(req.url);
      const publicId = searchParams.get("id");
      const rangeHeader = req.headers.get("range");

      console.log("[GET] Request details:", {
        publicId,
        rangeHeader,
        method: req.method,
        url: req.url,
        host: req.headers.get("host"),
        origin: req.headers.get("origin"),
      });

      if (!publicId) {
        console.warn("[GET] Missing file ID");
        return createErrorResponse("Missing file ID", 400, req);
      }

      // Lấy token hợp lệ
      console.log("[GET] Getting valid tokens...");
      const tokens = await getValidTokens();
      if (!tokens) {
        console.error("[GET] Token validation failed");
        return createErrorResponse("Unauthorized - Token invalid", 401, req);
      }
      console.log("[GET] Tokens validated successfully");

      const driveId = decryptId(publicId);
      console.log("[GET] Decrypted drive ID:", driveId);

      console.log("[GET] Fetching file metadata...");
      const metadata = await getFileMetadata(driveId, tokens);
      console.log("[GET] File metadata received:", {
        mimeType: metadata.mimeType,
        size: metadata.size,
        id: driveId,
        headers: metadata.headers || {},
        error: metadata.error || null,
      });

      logger.info("[GET] File metadata:", {
        mimeType: metadata.mimeType,
        size: metadata.size,
      });

      // Kích thước chunk cố định cho toàn bộ video
      const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB mỗi chunk
      const MAX_CHUNK_SIZE = 15 * 1024 * 1024; // Giới hạn max 15MB mỗi response
      const TOTAL_CHUNKS = Math.ceil(metadata.size / CHUNK_SIZE);

      // Tạo ETag duy nhất cho video và version
      const VERSION = "v5"; // Tăng version khi thay đổi logic cache
      const videoETag = `"${VERSION}-${driveId}-${metadata.size}"`;

      // Headers cơ bản - KHÔNG thêm CORS headers ở đây
      const responseHeaders = {
        "Content-Type": metadata.mimeType,
        "Accept-Ranges": "bytes",
        ETag: videoETag,
        "Last-Modified": new Date().toUTCString(),
        "CF-Edge-Cache": "cache-all",
        Vary: "Range, Accept-Encoding",
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
        let actualEnd = Math.min(requestedEnd || metadata.size - 1, chunkEnd);

        // Xử lý seek request
        const isSeekRequest = !requestedEnd;
        if (isSeekRequest) {
          // Trả về chunk hiện tại + một phần chunk tiếp theo để đảm bảo phát mượt
          const safeBufferSize = 2 * 1024 * 1024; // 2MB buffer
          actualEnd = Math.min(chunkEnd + safeBufferSize, metadata.size - 1);
        } else {
          const remainingInChunk = chunkEnd - start + 1;
          const isNearChunkBoundary = remainingInChunk < CHUNK_SIZE * 0.2;

          if (isNearChunkBoundary || requestedEnd - start > CHUNK_SIZE * 2) {
            const nextChunkSize = Math.min(
              MAX_CHUNK_SIZE - remainingInChunk,
              CHUNK_SIZE
            );
            actualEnd = Math.min(start + nextChunkSize - 1, metadata.size - 1);
          }
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

          logger.info("[GET] Range request:", {
            start,
            requestedEnd,
          });

          // Kiểm tra range hợp lệ
          if (
            start >= metadata.size ||
            requestedEnd >= metadata.size ||
            start > requestedEnd
          ) {
            return createErrorResponse("Range Not Satisfiable", 416, req);
          }

          // Tính toán chunk hiện tại
          const currentChunk = getChunkIndexFromPosition(start);
          const {
            start: actualStart,
            end: actualEnd,
            includesNextChunk,
          } = getOptimalRange(start, requestedEnd, currentChunk);

          logger.info("[GET] Optimal range:", {
            actualStart,
            actualEnd,
            includesNextChunk,
          });

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

          const maxAge = 2592000; // 30 days

          // Luôn cache mọi request
          responseHeaders[
            "Cache-Control"
          ] = `public, max-age=${maxAge}, stale-while-revalidate=86400`;
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

          logger.info("Serving chunk:", {
            originalRange: `${start}-${requestedEnd}`,
            servingRange: `${actualStart}-${actualEnd}`,
            size: `${((actualEnd - actualStart + 1) / 1024 / 1024).toFixed(
              1
            )}MB`,
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

        logger.info("Serving initial chunks:", {
          range: `0-${end}`,
          size: `${((end + 1) / 1024 / 1024).toFixed(1)}MB`,
          chunks: [0, 1],
          totalChunks: TOTAL_CHUNKS,
          cacheKey: responseHeaders["CF-Cache-Key"],
          cacheDuration: "30d",
        });
      }

      // Xử lý yêu cầu HEAD
      if (req.method === "HEAD") {
        return createCorsResponse(null, 200, responseHeaders, req);
      }

      // Tải chunk từ Google Drive
      const { stream } = await downloadFile(driveId, options, tokens);
      return createCorsResponse(stream, status, responseHeaders, req);
    } catch (error) {
      logger.error("Error in GET handler:", error);
      if (error.name === "AbortError") {
        return createErrorResponse("Request aborted", 499, req);
      }
      throw error;
    }
  });
}
