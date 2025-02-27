import { google } from "googleapis";

// Import các hàm từ idm.js
const idm = require("./idm");

console.log("🚀 Sử dụng IDM Engine tối ưu để tải file với tốc độ tối đa!");

// Hàm kiểm tra và làm mới token nếu cần
async function refreshTokenIfNeeded(tokens) {
  // Kiểm tra xem token đã hết hạn chưa
  // Nếu expiry_date tồn tại và thời gian hiện tại đã vượt quá expiry_date trừ đi 5 phút
  // (thêm buffer 5 phút để đảm bảo token không hết hạn trong quá trình tải)
  const now = Date.now();
  const expiryTime = tokens.expiry_date;
  const bufferTime = 5 * 60 * 1000; // 5 phút

  if (expiryTime && now > expiryTime - bufferTime) {
    console.log("Token sắp hết hạn, đang làm mới token...");

    // Tạo OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.CALLBACK_URL
    );

    // Thiết lập credentials hiện tại
    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type,
      id_token: tokens.id_token,
    });

    try {
      // Làm mới token
      const { credentials } = await oauth2Client.refreshAccessToken();
      console.log("Đã làm mới token thành công!");

      // Cập nhật tokens
      return {
        ...tokens,
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date,
        id_token: credentials.id_token || tokens.id_token,
        token_type: credentials.token_type || tokens.token_type,
      };
    } catch (error) {
      console.error("Lỗi khi làm mới token:", error.message);
      // Vẫn trả về token cũ để thử tiếp
      return tokens;
    }
  }

  // Nếu token vẫn còn hạn, trả về token đó
  return tokens;
}

// Re-export các hàm từ idm.js để tương thích ngược với code hiện có
export async function getFileMetadata(fileId, tokens) {
  // Làm mới token nếu cần
  const updatedTokens = await refreshTokenIfNeeded(tokens);

  // Chuẩn bị OAuth client theo cách cũ để tương thích
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: updatedTokens.access_token,
    refresh_token: updatedTokens.refresh_token,
    expiry_date: updatedTokens.expiry_date,
    scope: updatedTokens.scope,
    token_type: updatedTokens.token_type,
    id_token: updatedTokens.id_token,
  });

  try {
    console.log("Đang lấy thông tin file sử dụng IDM Engine...");
    // Sử dụng hàm từ idm.js với token đã được làm mới
    const response = await idm.getFileMetadata(fileId, updatedTokens);
    return response.data;
  } catch (error) {
    console.error("Lỗi khi lấy thông tin file:", error);
    throw error;
  }
}

// Export hàm downloadFile sử dụng idm.js
export async function downloadFile(fileId, options = {}, tokens) {
  try {
    // Làm mới token nếu cần
    const updatedTokens = await refreshTokenIfNeeded(tokens);

    console.log("Đang tải file sử dụng IDM Engine với 32 kết nối song song...");
    // Sử dụng hàm từ idm.js với token đã được làm mới
    return await idm.downloadFile(fileId, options, updatedTokens);
  } catch (error) {
    console.error("Lỗi khi tải file:", error);
    throw error;
  }
}

// Export hàm downloadFileToPath từ idm.js nếu cần
export async function downloadFileToPath(
  fileId,
  outputPath,
  options = {},
  tokens
) {
  try {
    // Làm mới token nếu cần
    const updatedTokens = await refreshTokenIfNeeded(tokens);

    console.log(
      `Đang tải file vào đường dẫn ${outputPath} sử dụng IDM Engine...`
    );
    // Sử dụng hàm từ idm.js với token đã được làm mới
    return await idm.downloadFileToPath(
      fileId,
      outputPath,
      options,
      updatedTokens
    );
  } catch (error) {
    console.error("Lỗi khi tải file vào đường dẫn:", error);
    throw error;
  }
}

// Thêm hàm theo dõi token trong quá trình tải dài
// Hàm này sẽ định kỳ kiểm tra và làm mới token để đảm bảo không bị gián đoạn khi tải file lớn
export async function downloadWithTokenRefresh(
  fileId,
  options = {},
  tokens,
  onProgress
) {
  try {
    // Làm mới token ban đầu nếu cần
    let currentTokens = await refreshTokenIfNeeded(tokens);

    console.log("Bắt đầu tải file với cơ chế làm mới token tự động...");

    // Tạo stream để đọc từ idm.downloadFile
    const stream = await idm.downloadFile(fileId, options, currentTokens);

    // Thiết lập hẹn giờ để định kỳ kiểm tra và làm mới token (mỗi 30 phút)
    const tokenRefreshInterval = 30 * 60 * 1000; // 30 phút
    let lastRefreshTime = Date.now();

    // Tạo interval để kiểm tra và làm mới token
    const intervalId = setInterval(async () => {
      try {
        // Kiểm tra xem đã đến lúc làm mới token chưa
        if (Date.now() - lastRefreshTime >= tokenRefreshInterval) {
          console.log("Kiểm tra và làm mới token trong quá trình tải...");
          currentTokens = await refreshTokenIfNeeded(currentTokens);
          lastRefreshTime = Date.now();
        }
      } catch (error) {
        console.error("Lỗi khi làm mới token trong quá trình tải:", error);
      }
    }, 5 * 60 * 1000); // Kiểm tra mỗi 5 phút

    // Xử lý khi stream kết thúc
    stream.on("end", () => {
      clearInterval(intervalId);
      console.log("Tải file hoàn tất, dừng quá trình làm mới token.");
    });

    // Xử lý khi có lỗi
    stream.on("error", (error) => {
      clearInterval(intervalId);
      console.error("Lỗi trong quá trình tải file:", error);
    });

    return stream;
  } catch (error) {
    console.error("Lỗi khi khởi tạo quá trình tải:", error);
    throw error;
  }
}

// Để giữ tương thích ngược, giữ lại các hằng số từ file drive.js cũ
// Các giá trị này chỉ để reference, không còn được sử dụng vì code đã chuyển sang idm.js
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB mỗi chunk
const MAX_PARALLEL_CHUNKS = 32; // Tăng lên 32 giống IDM
const INITIAL_PARALLEL_CHUNKS = 8; // Bắt đầu với 8 kết nối và tăng dần
const MAX_RETRIES = 10; // Tăng số lần thử lại tối đa cho mỗi chunk
const RETRY_DELAY = 1000; // Thời gian chờ giữa các lần thử lại (ms)
const CONNECTION_STAGGER_DELAY = 250; // Thời gian giãn cách giữa các kết nối (ms)
const RATE_LIMIT_WINDOW = 60000; // Cửa sổ theo dõi giới hạn tỷ lệ (60 giây)
const MAX_REQUESTS_PER_MINUTE = 10000; // Giữ dưới giới hạn API của Google (12000/min)

// Danh sách User-Agents từ file drive.js cũ (chỉ để tham khảo)
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
];

// Hàm delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function downloadChunk(
  drive,
  fileId,
  start,
  end,
  options = {},
  retryCount = 0
) {
  try {
    // Chọn User-Agent ngẫu nhiên để mô phỏng trình duyệt khác nhau
    const randomUserAgent =
      USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    // Thêm một chút độ lệch ngẫu nhiên vào phạm vi byte để tránh mẫu request dễ đoán
    // Chỉ áp dụng cho lần thử lại, không cho lần đầu tiên
    let adjustedStart = start;
    let adjustedEnd = end;

    if (retryCount > 0) {
      // Nếu là lần thử lại, điều chỉnh phạm vi byte một chút
      const maxAdjustment = Math.min(10000, (end - start) / 20); // Tối đa 10KB hoặc 5% kích thước chunk
      const startAdjustment = Math.floor(Math.random() * maxAdjustment);

      // Điều chỉnh phạm vi byte để tránh điểm lỗi tiềm ẩn
      adjustedStart = Math.max(start - startAdjustment, 0);
      // Vẫn giữ kích thước chunk tương tự bằng cách điều chỉnh end tương ứng
      adjustedEnd = Math.min(
        adjustedStart + (end - start) + startAdjustment,
        end + maxAdjustment
      );
    }

    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
        ...options,
      },
      {
        responseType: "stream",
        headers: {
          Range: `bytes=${adjustedStart}-${adjustedEnd}`,
          "User-Agent": randomUserAgent,
          Accept: "application/octet-stream, application/json", // Thêm header Accept
          "Cache-Control": "no-cache", // Tránh cache giúp các request khác nhau
        },
        // Tăng timeout theo cấp mũ khi số lần thử tăng
        timeout: 60000 + retryCount * 15000,
      }
    );

    return {
      stream: response.data,
      startByte: adjustedStart,
      endByte: adjustedEnd,
      originalStart: start,
      originalEnd: end,
    };
  } catch (error) {
    // Xử lý thử lại khi gặp lỗi
    if (retryCount < MAX_RETRIES) {
      // Tính toán thời gian chờ theo cấp số mũ, nhưng thêm độ ngẫu nhiên
      // Giúp tránh tất cả các request thử lại cùng lúc
      const jitter = Math.floor(Math.random() * 1000); // Thêm độ ngẫu nhiên tối đa 1 giây
      const waitTime = RETRY_DELAY * Math.pow(1.5, retryCount) + jitter;

      console.log(
        `Lỗi khi tải chunk ${start}-${end}, thử lại lần ${
          retryCount + 1
        }/${MAX_RETRIES} sau ${waitTime}ms: ${error.message.substring(
          0,
          100
        )}...`
      );

      // Tăng thời gian chờ sau mỗi lần thử lại (exponential backoff with jitter)
      await delay(waitTime);
      return downloadChunk(drive, fileId, start, end, options, retryCount + 1);
    }
    throw error;
  }
}

// Phiên bản gốc của downloadFile - được đổi tên để tránh xung đột
// Giữ lại để tham khảo và tương thích ngược nếu cần thiết
export async function downloadFileOriginal(fileId, options = {}, tokens) {
  if (!tokens?.access_token) {
    throw new Error("Không có access token");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
    token_type: tokens.token_type,
    id_token: tokens.id_token,
  });

  const drive = google.drive({
    version: "v3",
    auth: oauth2Client,
  });

  try {
    // Lấy kích thước file
    const metadata = await drive.files.get({
      fileId: fileId,
      fields: "size,name",
    });

    const fileSize = parseInt(metadata.data.size);
    const fileName = metadata.data.name;

    console.log(
      `Chuẩn bị tải file "${fileName}" (${(fileSize / (1024 * 1024)).toFixed(
        2
      )}MB)`
    );

    // Kiểm tra nếu file nhỏ thì dùng phương pháp đơn giản hơn
    if (fileSize < 25 * 1024 * 1024) {
      // Dưới 25MB
      console.log(`File nhỏ hơn 25MB, tải trực tiếp...`);
      return downloadSmallFile(drive, fileId, options, fileSize);
    }

    const chunks = [];

    // Chia file thành các chunks
    for (let start = 0; start < fileSize; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
      chunks.push({ start, end });
    }

    console.log(
      `Chia file thành ${chunks.length} chunks, tải tối đa ${MAX_PARALLEL_CHUNKS} chunks song song`
    );

    // Tạo PassThrough stream để ghi kết quả
    const { PassThrough } = require("stream");
    const outputStream = new PassThrough();

    let downloadedSize = 0;
    const chunkResults = new Map(); // Lưu trữ kết quả tải của từng chunk
    let lastLogTime = Date.now();
    let failedChunks = new Set(); // Lưu trữ index của các chunks thất bại
    let lastCheckedSize = 0; // Dùng để tính tốc độ tải
    let startTime = Date.now(); // Thời gian bắt đầu tải

    const updateProgress = (chunkSize) => {
      downloadedSize += chunkSize;
      const now = Date.now();
      // Chỉ log tiến độ mỗi 1 giây hoặc khi tải xong
      if (now - lastLogTime > 1000 || downloadedSize >= fileSize) {
        const progress = ((downloadedSize / fileSize) * 100).toFixed(2);
        const elapsedSec = (now - startTime) / 1000;
        const downloadedMB = downloadedSize / (1024 * 1024);
        const totalMB = fileSize / (1024 * 1024);

        // Tính tốc độ tải (MB/s)
        const sizeDiff = downloadedSize - lastCheckedSize;
        const timeDiff = (now - lastLogTime) / 1000;
        const speedMBps =
          timeDiff > 0 ? (sizeDiff / 1024 / 1024 / timeDiff).toFixed(2) : 0;

        // Ước tính thời gian còn lại
        const remainingBytes = fileSize - downloadedSize;
        const avgSpeedBps = downloadedSize / elapsedSec;
        const remainingSec =
          avgSpeedBps > 0 ? Math.round(remainingBytes / avgSpeedBps) : 0;
        const remainingTime =
          remainingSec > 60
            ? `${Math.floor(remainingSec / 60)} phút ${remainingSec % 60} giây`
            : `${remainingSec} giây`;

        process.stdout.write(
          `\rĐã tải: ${progress}% (${downloadedMB.toFixed(
            2
          )}MB/${totalMB.toFixed(
            2
          )}MB) - Tốc độ: ${speedMBps} MB/s - Còn lại: ${remainingTime}`
        );

        lastLogTime = now;
        lastCheckedSize = downloadedSize;
      }
    };

    // Tải chunks theo nhóm, đảm bảo theo thứ tự
    const downloadChunks = async () => {
      let nextChunkIndexToWrite = 0;
      let failedAttempts = 0;
      let activeDownloads = 0; // Theo dõi số lượng tải xuống đang hoạt động
      let dynamicLimit = INITIAL_PARALLEL_CHUNKS; // Bắt đầu với một số lượng kết nối an toàn
      let successiveErrors = 0; // Đếm số lỗi liên tiếp
      let lastSuccessTime = Date.now(); // Thời gian thành công cuối cùng

      // Theo dõi số lượng request trong cửa sổ thời gian để tránh vượt quá giới hạn API
      const recentRequests = [];

      // Hàm kiểm tra giới hạn request
      const checkRateLimit = () => {
        const now = Date.now();
        // Xóa các request cũ hơn RATE_LIMIT_WINDOW
        while (
          recentRequests.length > 0 &&
          recentRequests[0] < now - RATE_LIMIT_WINDOW
        ) {
          recentRequests.shift();
        }
        // Kiểm tra nếu đã gần đạt giới hạn
        if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) {
          // Tính thời gian cần đợi để tiếp tục
          const oldestRequest = recentRequests[0];
          const waitTime = Math.max(
            oldestRequest + RATE_LIMIT_WINDOW - now,
            100
          );
          console.log(
            `Đạt ngưỡng giới hạn API (${recentRequests.length} requests/min), đợi ${waitTime}ms`
          );
          return waitTime;
        }
        return 0;
      };

      // Hàm đánh dấu một request mới
      const trackRequest = () => {
        recentRequests.push(Date.now());
      };

      // Tập hợp tất cả chunks cần tải
      const remainingChunks = new Set(
        Array.from({ length: chunks.length }, (_, i) => i)
      );

      // Theo dõi tốc độ tải trung bình để điều chỉnh số lượng kết nối song song
      let totalBytesLastMinute = 0;
      let lastMinuteCheck = Date.now();
      let speedHistory = [];

      // Định kỳ kiểm tra và điều chỉnh tốc độ
      const speedCheckInterval = setInterval(() => {
        const now = Date.now();
        if (now - lastMinuteCheck >= 30000) {
          // Mỗi 30 giây
          const minutesFraction = (now - lastMinuteCheck) / 60000;
          const speedMBps =
            totalBytesLastMinute / 1024 / 1024 / minutesFraction;

          // Lưu lịch sử tốc độ (giữ tối đa 3 giá trị)
          speedHistory.push(speedMBps);
          if (speedHistory.length > 3) speedHistory.shift();

          // Tính tốc độ trung bình
          const avgSpeed =
            speedHistory.reduce((sum, speed) => sum + speed, 0) /
            speedHistory.length;

          console.log(
            `\nTốc độ tải trung bình: ${avgSpeed.toFixed(
              2
            )} MB/s với ${dynamicLimit} kết nối song song`
          );

          // Tự động điều chỉnh số lượng kết nối dựa trên tốc độ
          if (successiveErrors === 0) {
            if (speedHistory.length >= 2) {
              const prevSpeed = speedHistory[speedHistory.length - 2];
              const currentSpeed = speedHistory[speedHistory.length - 1];

              // Nếu tăng số kết nối làm tăng tốc độ
              if (
                currentSpeed > prevSpeed * 1.1 &&
                dynamicLimit < MAX_PARALLEL_CHUNKS
              ) {
                dynamicLimit = Math.min(dynamicLimit + 2, MAX_PARALLEL_CHUNKS);
                console.log(
                  `Tăng giới hạn kết nối lên ${dynamicLimit} do tốc độ cải thiện`
                );
              }
              // Nếu tốc độ giảm dù tăng số kết nối
              else if (
                currentSpeed < prevSpeed * 0.9 &&
                dynamicLimit > INITIAL_PARALLEL_CHUNKS
              ) {
                dynamicLimit = Math.max(
                  dynamicLimit - 2,
                  INITIAL_PARALLEL_CHUNKS
                );
                console.log(
                  `Giảm giới hạn kết nối xuống ${dynamicLimit} do tốc độ giảm`
                );
              }
            }
          }

          totalBytesLastMinute = 0;
          lastMinuteCheck = now;
        }
      }, 10000);

      // Tải tuần tự các nhóm chunk
      while (remainingChunks.size > 0) {
        if (failedAttempts > 3) {
          clearInterval(speedCheckInterval);
          throw new Error(`Quá nhiều lỗi khi tải file, hủy tải`);
        }

        // Kiểm tra giới hạn tỷ lệ request
        const waitTime = checkRateLimit();
        if (waitTime > 0) {
          await delay(waitTime);
          continue;
        }

        // Lấy danh sách chunks chưa tải và chưa đang tải
        const availableChunks = Array.from(remainingChunks)
          .filter(
            (i) => !chunkResults.has(i) && !Array.from(failedChunks).includes(i)
          )
          .slice(0, dynamicLimit - activeDownloads);

        if (availableChunks.length === 0 && activeDownloads === 0) {
          // Nếu không còn chunk nào để tải và không có tải đang hoạt động
          // nghĩa là chỉ còn lại các chunks bị lỗi
          break;
        }

        // Chuẩn bị tải nhóm chunk hiện tại
        for (const chunkIndex of availableChunks) {
          const { start, end } = chunks[chunkIndex];

          // Tăng số lượng tải đang hoạt động
          activeDownloads++;

          // Mô phỏng IDM: giãn cách thời gian giữa các kết nối
          await delay(CONNECTION_STAGGER_DELAY);

          (async () => {
            try {
              // Đánh dấu một request mới đối với Google API
              trackRequest();

              console.log(
                `Bắt đầu tải chunk ${chunkIndex + 1}/${
                  chunks.length
                } (${start}-${end})`
              );

              const {
                stream: chunkStream,
                startByte,
                endByte,
                originalStart,
                originalEnd,
              } = await downloadChunk(drive, fileId, start, end, options);

              // Thu thập dữ liệu từ stream thành buffer
              const chunkData = [];

              await new Promise((resolve, reject) => {
                chunkStream.on("data", (chunk) => {
                  chunkData.push(chunk);
                  updateProgress(chunk.length);
                  totalBytesLastMinute += chunk.length; // Theo dõi dữ liệu đã tải cho việc tính tốc độ
                });

                chunkStream.on("end", () => {
                  const buffer = Buffer.concat(chunkData);

                  // Xử lý trường hợp điều chỉnh byte range
                  if (startByte !== originalStart || endByte !== originalEnd) {
                    // Cắt buffer để lấy đúng phần dữ liệu yêu cầu ban đầu
                    const offsetStart = originalStart - startByte;
                    const offsetEnd =
                      offsetStart + (originalEnd - originalStart) + 1;
                    if (offsetStart >= 0 && offsetEnd <= buffer.length) {
                      const adjustedBuffer = buffer.slice(
                        offsetStart,
                        offsetEnd
                      );
                      chunkResults.set(chunkIndex, adjustedBuffer);
                    } else {
                      // Nếu không thể cắt chính xác, sử dụng toàn bộ buffer
                      chunkResults.set(chunkIndex, buffer);
                      console.log(
                        `Cảnh báo: Không thể điều chỉnh chunk ${chunkIndex} chính xác`
                      );
                    }
                  } else {
                    chunkResults.set(chunkIndex, buffer);
                  }

                  remainingChunks.delete(chunkIndex);
                  successiveErrors = 0; // Reset số lỗi liên tiếp
                  lastSuccessTime = Date.now();

                  console.log(
                    `Hoàn thành chunk ${chunkIndex + 1}/${chunks.length}`
                  );

                  // Cập nhật giới hạn động nếu tải thành công
                  if (
                    dynamicLimit < MAX_PARALLEL_CHUNKS &&
                    successiveErrors === 0
                  ) {
                    dynamicLimit = Math.min(
                      dynamicLimit + 1,
                      MAX_PARALLEL_CHUNKS
                    );
                    console.log(`Tăng giới hạn kết nối lên ${dynamicLimit}`);
                  }

                  resolve();
                });

                chunkStream.on("error", (error) => {
                  console.error(
                    `Lỗi trong chunk ${chunkIndex}:`,
                    error.message
                  );
                  failedChunks.add(chunkIndex);
                  successiveErrors++;

                  // Kiểm tra nếu gặp lỗi rate limit (403 hoặc 429)
                  if (
                    error.message.includes("403") ||
                    error.message.includes("429")
                  ) {
                    console.log(
                      `Phát hiện lỗi giới hạn tỷ lệ, giảm số lượng kết nối đồng thời`
                    );
                    dynamicLimit = Math.max(2, Math.floor(dynamicLimit / 2));
                    // Đợi một khoảng thời gian dài hơn trước khi tiếp tục
                    setTimeout(() => {
                      // Đặt lại recentRequests để tránh bị chặn liên tục
                      recentRequests.length = 0;
                    }, 5000);
                  }
                  // Giảm số lượng kết nối đồng thời nếu có nhiều lỗi liên tiếp
                  else if (successiveErrors > 2 && dynamicLimit > 2) {
                    dynamicLimit = Math.max(2, dynamicLimit - 2);
                    console.log(
                      `Giảm giới hạn kết nối xuống ${dynamicLimit} do nhiều lỗi liên tiếp`
                    );
                  }

                  reject(error);
                });
              });
            } catch (error) {
              console.error(
                `Lỗi khi tải chunk ${chunkIndex + 1}:`,
                error.message
              );
              failedChunks.add(chunkIndex);
              failedAttempts++;
              successiveErrors++;

              // Kiểm tra lỗi giới hạn API
              if (
                error.message.includes("403") ||
                error.message.includes("429")
              ) {
                console.log(`Phát hiện lỗi giới hạn API, giảm giới hạn và đợi`);
                dynamicLimit = Math.max(2, Math.floor(dynamicLimit / 2));
                // Đợi một khoảng thời gian dài hơn
                await delay(10000);
                // Đặt lại recentRequests để tránh bị chặn liên tục
                recentRequests.length = 0;
              }
              // Giảm giới hạn kết nối nếu có nhiều lỗi liên tiếp
              else if (successiveErrors > 2 && dynamicLimit > 2) {
                dynamicLimit = Math.max(2, dynamicLimit - 2);
                console.log(
                  `Giảm giới hạn kết nối xuống ${dynamicLimit} do nhiều lỗi liên tiếp`
                );
              }
            } finally {
              activeDownloads--;

              // Ghi các chunks đã hoàn thành theo thứ tự
              while (chunkResults.has(nextChunkIndexToWrite)) {
                outputStream.write(chunkResults.get(nextChunkIndexToWrite));
                chunkResults.delete(nextChunkIndexToWrite);
                nextChunkIndexToWrite++;
              }
            }
          })();
        }

        // Chờ một chút trước khi kiểm tra lại trạng thái
        await delay(500);

        // Kiểm tra nếu đã quá lâu mà không thành công
        const timeSinceLastSuccess = Date.now() - lastSuccessTime;
        if (timeSinceLastSuccess > 60000 && activeDownloads === 0) {
          // 60 giây không có tiến triển
          console.log(
            `Đã ${
              timeSinceLastSuccess / 1000
            } giây không có tiến triển, điều chỉnh chiến lược...`
          );

          // Đặt lại giới hạn động về mức thấp
          dynamicLimit = Math.max(2, Math.floor(dynamicLimit / 2));
          console.log(`Đặt lại giới hạn kết nối xuống ${dynamicLimit}`);

          // Đặt lại thời gian thành công để tránh kích hoạt liên tục
          lastSuccessTime = Date.now();
        }
      }

      // Dọn dẹp interval tính tốc độ tải
      clearInterval(speedCheckInterval);

      // Xử lý các chunks bị lỗi (nếu có)
      if (failedChunks.size > 0) {
        console.log(
          `\nCó ${failedChunks.size} chunks bị lỗi, thử lại từng chunk...`
        );

        // Thử lại từng chunk bị lỗi, một cách tuần tự
        for (const chunkIndex of failedChunks) {
          const { start, end } = chunks[chunkIndex];

          try {
            console.log(
              `Thử lại chunk ${chunkIndex + 1}/${
                chunks.length
              } (${start}-${end})`
            );

            // Đánh dấu một request mới đối với Google API
            trackRequest();

            // Thử lại với timeout cao hơn và tham số đặc biệt
            const {
              stream: chunkStream,
              startByte,
              endByte,
              originalStart,
              originalEnd,
            } = await downloadChunk(
              drive,
              fileId,
              start,
              end,
              {
                ...options,
                // Thêm tham số đặc biệt cho lần thử lại cuối cùng
                supportsTeamDrives: true,
                supportsAllDrives: true,
              },
              0
            ); // Bắt đầu từ retryCount = 0

            const chunkData = [];

            await new Promise((resolve, reject) => {
              chunkStream.on("data", (chunk) => {
                chunkData.push(chunk);
                updateProgress(chunk.length);
                totalBytesLastMinute += chunk.length;
              });

              chunkStream.on("end", () => {
                const buffer = Buffer.concat(chunkData);

                // Xử lý trường hợp điều chỉnh byte range
                if (startByte !== originalStart || endByte !== originalEnd) {
                  // Cắt buffer để lấy đúng phần dữ liệu yêu cầu ban đầu
                  const offsetStart = originalStart - startByte;
                  const offsetEnd =
                    offsetStart + (originalEnd - originalStart) + 1;
                  if (offsetStart >= 0 && offsetEnd <= buffer.length) {
                    const adjustedBuffer = buffer.slice(offsetStart, offsetEnd);
                    chunkResults.set(chunkIndex, adjustedBuffer);
                  } else {
                    chunkResults.set(chunkIndex, buffer);
                  }
                } else {
                  chunkResults.set(chunkIndex, buffer);
                }

                console.log(
                  `Thành công: chunk ${chunkIndex + 1}/${chunks.length}`
                );
                failedChunks.delete(chunkIndex);
                resolve();
              });

              chunkStream.on("error", reject);
            });
          } catch (error) {
            console.error(
              `Không thể tải chunk ${chunkIndex + 1} sau nhiều lần thử:`,
              error.message
            );
            throw new Error(
              `Không thể tải file do lỗi ở chunk ${chunkIndex + 1}`
            );
          }
        }
      }

      // Ghi tất cả chunks còn lại theo thứ tự
      for (let i = nextChunkIndexToWrite; i < chunks.length; i++) {
        if (chunkResults.has(i)) {
          outputStream.write(chunkResults.get(i));
          chunkResults.delete(i);
        } else {
          throw new Error(`Thiếu chunk ${i + 1} khi hoàn thành file`);
        }
      }

      console.log("\nHoàn thành tải file");
      outputStream.end();
    };

    // Bắt đầu tải
    downloadChunks().catch((error) => {
      console.error("Lỗi khi tải chunks:", error.message);
      outputStream.destroy(error);
    });

    return outputStream;
  } catch (error) {
    console.error("Lỗi khi chuẩn bị tải file:", error.message);
    throw error;
  }
}

// Hàm tải file nhỏ
async function downloadSmallFile(drive, fileId, options, fileSize) {
  const { PassThrough } = require("stream");
  const outputStream = new PassThrough();

  let downloadedSize = 0;
  let lastLogTime = Date.now();
  let lastCheckedSize = 0;
  let startTime = Date.now();

  const updateProgress = (size) => {
    downloadedSize += size;
    const now = Date.now();
    if (now - lastLogTime > 1000) {
      const progress = ((downloadedSize / fileSize) * 100).toFixed(2);
      const downloadedMB = downloadedSize / (1024 * 1024);
      const totalMB = fileSize / (1024 * 1024);

      // Tính tốc độ tải (MB/s)
      const sizeDiff = downloadedSize - lastCheckedSize;
      const timeDiff = (now - lastLogTime) / 1000;
      const speedMBps =
        timeDiff > 0 ? (sizeDiff / 1024 / 1024 / timeDiff).toFixed(2) : 0;

      // Ước tính thời gian còn lại
      const elapsedSec = (now - startTime) / 1000;
      const remainingBytes = fileSize - downloadedSize;
      const avgSpeedBps = downloadedSize / elapsedSec;
      const remainingSec =
        avgSpeedBps > 0 ? Math.round(remainingBytes / avgSpeedBps) : 0;
      const remainingTime =
        remainingSec > 60
          ? `${Math.floor(remainingSec / 60)} phút ${remainingSec % 60} giây`
          : `${remainingSec} giây`;

      process.stdout.write(
        `\rĐã tải: ${progress}% (${downloadedMB.toFixed(2)}MB/${totalMB.toFixed(
          2
        )}MB) - Tốc độ: ${speedMBps} MB/s - Còn lại: ${remainingTime}`
      );

      lastLogTime = now;
      lastCheckedSize = downloadedSize;
    }
  };

  try {
    let retryCount = 0;
    const MAX_SIMPLE_RETRIES = 5;

    while (retryCount < MAX_SIMPLE_RETRIES) {
      try {
        // Chọn User-Agent ngẫu nhiên để mô phỏng trình duyệt khác nhau
        const randomUserAgent =
          USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

        const response = await drive.files.get(
          {
            fileId: fileId,
            alt: "media",
            supportsAllDrives: true, // Hỗ trợ tất cả các loại drive
            ...options,
          },
          {
            responseType: "stream",
            timeout: 120000 + retryCount * 30000, // Tăng timeout theo số lần thử
            headers: {
              "User-Agent": randomUserAgent,
              Accept: "application/octet-stream, application/json",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          }
        );

        response.data.on("data", (chunk) => {
          updateProgress(chunk.length);
        });

        response.data.pipe(outputStream);

        await new Promise((resolve, reject) => {
          response.data.on("end", () => {
            console.log("\nHoàn thành tải file nhỏ");
            resolve();
          });

          response.data.on("error", (error) => {
            reject(error);
          });

          outputStream.on("error", (error) => {
            reject(error);
          });
        });

        // Nếu chạy đến đây thì thành công
        return outputStream;
      } catch (error) {
        retryCount++;
        console.error(
          `Lỗi khi tải file nhỏ (lần thử ${retryCount}/${MAX_SIMPLE_RETRIES}):`,
          error.message
        );

        if (retryCount >= MAX_SIMPLE_RETRIES) {
          outputStream.destroy(error);
          throw error;
        }

        // Chờ trước khi thử lại với tăng thời gian chờ theo cấp số mũ và độ ngẫu nhiên
        const jitter = Math.floor(Math.random() * 1000); // Độ ngẫu nhiên tối đa 1 giây
        const waitTime = RETRY_DELAY * Math.pow(2, retryCount) + jitter;
        console.log(`Đợi ${waitTime}ms trước khi thử lại...`);
        await delay(waitTime);
      }
    }

    throw new Error("Không thể tải file sau nhiều lần thử");
  } catch (error) {
    outputStream.destroy(error);
    throw error;
  }

  return outputStream;
}
