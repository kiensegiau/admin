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

// Cập nhật hàm getCorsHeaders để xử lý tốt hơn
function getCorsHeaders(request) {
  const origin = request.headers.get("origin");
  const method = request.method;

  // Log request details
  console.log("[CORS] Request details:", {
    origin,
    method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
    allowedOrigins: CORS_CONFIG.ALLOWED_ORIGINS,
    isOriginAllowed: CORS_CONFIG.ALLOWED_ORIGINS.includes(origin),
  });

  // Validate origin
  if (!origin) {
    console.warn("[CORS] No origin provided");
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": CORS_CONFIG.ALLOWED_METHODS.join(", "),
      "Access-Control-Allow-Headers": CORS_CONFIG.ALLOWED_HEADERS.join(", "),
      "Access-Control-Allow-Credentials": "false", // Không cho phép credentials khi origin là *
      "Access-Control-Max-Age": CORS_CONFIG.MAX_AGE,
      "Access-Control-Expose-Headers": CORS_CONFIG.EXPOSED_HEADERS.join(", "),
      Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
    };
  }

  if (!CORS_CONFIG.ALLOWED_ORIGINS.includes(origin)) {
    console.warn("[CORS] Invalid origin:", origin);
    return {
      "Access-Control-Allow-Origin": CORS_CONFIG.ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": CORS_CONFIG.ALLOWED_METHODS.join(", "),
      "Access-Control-Allow-Headers": CORS_CONFIG.ALLOWED_HEADERS.join(", "),
      "Access-Control-Allow-Credentials": CORS_CONFIG.CREDENTIALS,
      "Access-Control-Max-Age": CORS_CONFIG.MAX_AGE,
      "Access-Control-Expose-Headers": CORS_CONFIG.EXPOSED_HEADERS.join(", "),
      Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
    };
  }

  // Generate headers for valid origin
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": CORS_CONFIG.ALLOWED_METHODS.join(", "),
    "Access-Control-Allow-Headers": CORS_CONFIG.ALLOWED_HEADERS.join(", "),
    "Access-Control-Allow-Credentials": CORS_CONFIG.CREDENTIALS,
    "Access-Control-Max-Age": CORS_CONFIG.MAX_AGE,
    "Access-Control-Expose-Headers": CORS_CONFIG.EXPOSED_HEADERS.join(", "),
    Vary: "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
  };

  // Log generated headers
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

// Cập nhật middleware để xử lý tốt hơn các trường hợp lỗi
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

    try {
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
    } catch (error) {
      console.error("[CORS] Error in OPTIONS handler:", error);
      return createErrorResponse("Internal Server Error", 500, request);
    }
  }

  try {
    console.log("[CORS] Processing main request");
    const response = await handler(request);

    // Kiểm tra response
    if (!response) {
      console.error("[CORS] Handler returned null/undefined response");
      return createErrorResponse("Internal Server Error", 500, request);
    }

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

    // Xử lý các loại lỗi cụ thể
    if (error.name === "AbortError") {
      return createErrorResponse("Request aborted", 499, request);
    }
    if (
      error.name === "TypeError" &&
      error.message.includes("Failed to fetch")
    ) {
      return createErrorResponse("Failed to fetch resource", 503, request);
    }
    if (error.name === "NetworkError") {
      return createErrorResponse("Network error occurred", 503, request);
    }

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
        Vary: "Range, Accept-Encoding, Origin",
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
        try {
          const { end: chunkEnd } = getChunkRange(currentChunk);
          let actualEnd = Math.min(requestedEnd || metadata.size - 1, chunkEnd);

          // Validate input
          if (start < 0 || actualEnd < 0 || start >= metadata.size) {
            throw new Error("Invalid range parameters");
          }

          // Xử lý seek request
          const isSeekRequest = !requestedEnd;
          if (isSeekRequest) {
            const safeBufferSize = 10 * 1024 * 1024; // 10MB buffer
            actualEnd = Math.min(chunkEnd + safeBufferSize, metadata.size - 1);
          } else {
            const remainingInChunk = chunkEnd - start + 1;
            const isNearChunkBoundary = remainingInChunk < CHUNK_SIZE * 0.2;

            if (isNearChunkBoundary || requestedEnd - start > CHUNK_SIZE * 2) {
              const nextChunkSize = Math.min(MAX_CHUNK_SIZE - remainingInChunk, CHUNK_SIZE);
              actualEnd = Math.min(start + nextChunkSize - 1, metadata.size - 1);
            }
          }

          // Final validation
          if (actualEnd < start || actualEnd >= metadata.size) {
            throw new Error("Invalid optimized range");
          }

          return {
            start,
            end: actualEnd,
            includesNextChunk: actualEnd > chunkEnd
          };
        } catch (error) {
          logger.error("[getOptimalRange] Error:", error);
          throw error;
        }
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
          if (start >= metadata.size || (requestedEnd && requestedEnd >= metadata.size) || start > requestedEnd) {
            logger.warn("[GET] Invalid range request:", { start, requestedEnd, fileSize: metadata.size });
            return createErrorResponse(
              "Range Not Satisfiable", 
              416, 
              {
                "Content-Range": `bytes */${metadata.size}`,
                "Accept-Ranges": "bytes"
              }, 
              req
            );
          }

          // Tính toán chunk và range tối ưu
          const currentChunk = getChunkIndexFromPosition(start);
          const { start: actualStart, end: actualEnd, includesNextChunk } = getOptimalRange(start, requestedEnd, currentChunk);

          // Validate lại range sau khi tối ưu
          if (actualStart >= metadata.size || actualEnd >= metadata.size || actualStart > actualEnd) {
            logger.error("[GET] Invalid optimized range:", { actualStart, actualEnd, fileSize: metadata.size });
            return createErrorResponse("Internal Server Error", 500, req);
          }

          // Set response headers
          const contentLength = actualEnd - actualStart + 1;
          responseHeaders["Content-Range"] = `bytes ${actualStart}-${actualEnd}/${metadata.size}`;
          responseHeaders["Content-Length"] = contentLength.toString();
          responseHeaders["Accept-Ranges"] = "bytes";
          responseHeaders["Access-Control-Expose-Headers"] = [
            ...CORS_CONFIG.EXPOSED_HEADERS,
            "Content-Range",
            "Accept-Ranges"
          ].join(", ");

          // Cache Control headers cho range requests
          const cacheableTags = [generateCacheKey(publicId, currentChunk)];
          if (includesNextChunk) {
            cacheableTags.push(generateCacheKey(publicId, currentChunk + 1));
          }

          const maxAge = 5184000; // 60 days
          const rangeKey = `${actualStart}-${actualEnd}`;
          
          responseHeaders["Cache-Control"] = `public, max-age=${maxAge}, stale-while-revalidate=86400, must-revalidate`;
          responseHeaders["CDN-Cache-Control"] = `public, max-age=${maxAge}, must-revalidate`;
          responseHeaders["CF-Cache-Tags"] = cacheableTags.join(",");
          responseHeaders["CF-Cache-Key"] = `${generateCacheKey(publicId, currentChunk)}-${rangeKey}`;
          responseHeaders["CF-Edge-Cache-TTL"] = maxAge.toString();
          responseHeaders["Range-Vary"] = "bytes";
          responseHeaders["Vary"] = "Range, Accept-Encoding, Origin";

          // Debug headers
          responseHeaders["X-Current-Chunk"] = currentChunk.toString();
          responseHeaders["X-Original-Range"] = `${start}-${requestedEnd}`;
          responseHeaders["X-Serving-Range"] = `${actualStart}-${actualEnd}`;
          responseHeaders["X-Response-Size"] = `${(contentLength / 1024 / 1024).toFixed(1)}MB`;
          responseHeaders["X-Optimization"] = includesNextChunk ? "next-chunk-included" : "current-chunk-only";

          // Log thông tin chi tiết
          logger.info("[GET] Serving partial content", {
            originalRange: `${start}-${requestedEnd}`,
            optimizedRange: `${actualStart}-${actualEnd}`,
            contentLength,
            chunk: currentChunk,
            includesNextChunk,
            cacheKey: responseHeaders["CF-Cache-Key"]
          });

          // Set options cho downloadFile
          options.range = `bytes=${actualStart}-${actualEnd}`;
          status = 206; // Partial Content
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

export async function OPTIONS(request) {
  console.log("[OPTIONS] Processing preflight request");

  const corsHeaders = getCorsHeaders(request);
  const headers = new Headers(corsHeaders);

  // Add security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  // Log response headers
  console.log(
    "[OPTIONS] Response headers:",
    Object.fromEntries(headers.entries())
  );

  return new Response(null, {
    status: 204,
    headers: headers,
  });
}
