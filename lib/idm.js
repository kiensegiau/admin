const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { PassThrough } = require("stream");
const { pipeline } = require("stream/promises");

// Cấu hình tối ưu cho IDM
const MAX_PARALLEL_CHUNKS = 32; // Số lượng kết nối song song tối đa
const INITIAL_PARALLEL_CHUNKS = 25; // Tăng từ 8 lên 25 để tối ưu tốc độ ban đầu
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB mỗi chunk
const RETRY_DELAY = 1000; // 1 giây trước khi thử lại
const MAX_RETRIES = 10; // Số lần thử lại tối đa cho mỗi chunk
const CONNECTION_STAGGER_DELAY = 50; // Giảm từ 100ms xuống 50ms giữa mỗi kết nối mới
const PROGRESS_UPDATE_INTERVAL = 2000; // Tăng từ 1s lên 2s để giảm log
const SPEED_HISTORY_SIZE = 5; // Giảm số lượng mẫu tốc độ để phản ứng nhanh hơn
const LOG_DETAIL_LEVEL = 1; // 0: chỉ log tiến độ, 1: log quan trọng, 2: log tất cả

// Danh sách User-Agent để luân phiên sử dụng
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:90.0) Gecko/20100101 Firefox/90.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59",
];

// Hàm trì hoãn
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hàm định dạng kích thước file
const formatSize = (bytes) => {
  if (bytes < 1024) return bytes + " B";
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
  else if (bytes < 1024 * 1024 * 1024)
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  else return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
};

// Hàm định dạng thời gian
const formatTime = (seconds) => {
  if (seconds < 60) return `${Math.floor(seconds)} giây`;
  else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes} phút ${remainingSeconds} giây`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours} giờ ${minutes} phút`;
  }
};

// Hàm log có điều kiện dựa trên level
const conditionalLog = (message, level = 1) => {
  if (level <= LOG_DETAIL_LEVEL) {
    console.log(message);
  }
};

// Hàm tạo Drive API client
function createDriveClient(tokens) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials(tokens);
  return google.drive({ version: "v3", auth: oauth2Client });
}

// Hàm tải một chunk của file
async function downloadChunk(
  drive,
  fileId,
  start,
  end,
  fileSize,
  chunkIndex,
  totalChunks,
  retryCount = 0
) {
  try {
    // Chọn User-Agent ngẫu nhiên
    const randomUserAgent =
      USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    // Thêm jitter vào range để tránh mẫu dễ đoán
    const jitter = Math.floor(Math.random() * 10);
    const adjustedStart = Math.max(0, start - jitter);
    const adjustedEnd = Math.min(fileSize - 1, end + jitter);

    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
        supportsAllDrives: true,
      },
      {
        headers: {
          Range: `bytes=${adjustedStart}-${adjustedEnd}`,
          "User-Agent": randomUserAgent,
          Accept: "application/octet-stream, application/json",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        responseType: "stream",
        timeout: 60000 + retryCount * 30000, // Tăng timeout theo số lần thử
      }
    );

    // Tạo stream để lưu dữ liệu
    const buffers = [];

    return new Promise((resolve, reject) => {
      response.data.on("data", (chunk) => {
        buffers.push(chunk);
      });

      response.data.on("end", () => {
        // Nối các buffer lại với nhau
        const buffer = Buffer.concat(buffers);

        // Cắt bỏ phần jitter nếu có
        const startOffset = Math.max(0, jitter);
        const endOffset = buffer.length - Math.max(0, adjustedEnd - end);
        const trimmedBuffer = buffer.slice(startOffset, endOffset);

        resolve(trimmedBuffer);
      });

      response.data.on("error", (error) => {
        reject(error);
      });
    });
  } catch (error) {
    if (retryCount >= MAX_RETRIES) {
      throw new Error(
        `Không thể tải chunk ${
          chunkIndex + 1
        }/${totalChunks} sau ${MAX_RETRIES} lần thử: ${error.message}`
      );
    }

    // Tính toán thời gian chờ với backoff và jitter
    const jitter = Math.floor(Math.random() * 1000);
    const waitTime = RETRY_DELAY * Math.pow(1.5, retryCount) + jitter;

    // Chỉ log lỗi ở mức chi tiết 2 hoặc khi lỗi nghiêm trọng
    if (LOG_DETAIL_LEVEL >= 2 || retryCount > MAX_RETRIES / 2) {
      console.log(
        `Lỗi khi tải chunk ${chunkIndex + 1}/${totalChunks} (lần thử ${
          retryCount + 1
        }/${MAX_RETRIES}): ${error.message}`
      );
    }

    await delay(waitTime);

    // Thử lại với retryCount tăng lên
    return downloadChunk(
      drive,
      fileId,
      start,
      end,
      fileSize,
      chunkIndex,
      totalChunks,
      retryCount + 1
    );
  }
}

// Hàm tải file lớn bằng nhiều chunk song song
async function downloadLargeFile(drive, fileId, fileSize, options = {}) {
  // Tạo stream đầu ra
  const outputStream = new PassThrough();

  // Tính toán số lượng chunk
  const chunks = [];
  for (let start = 0; start < fileSize; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
    chunks.push({ start, end });
  }

  conditionalLog(`Chia file thành ${chunks.length} chunks để tải song song`, 1);

  // Biến theo dõi tiến độ
  let downloadedSize = 0;
  let lastLogTime = Date.now();
  let lastCheckedSize = 0;
  let startTime = Date.now();
  let speedHistory = [];
  let processedChunks = new Set();
  let chunkBuffers = new Map();
  let nextChunkToWrite = 0;
  let activeConnections = 0;
  let dynamicLimit = INITIAL_PARALLEL_CHUNKS; // Bắt đầu với 25 kết nối
  let consecutiveErrors = 0;
  let consecutiveSuccess = 0;
  let lastSpeedCheck = { time: Date.now(), size: 0 };
  let lastAverageSpeed = 0;
  let highestSpeed = 0; // Theo dõi tốc độ cao nhất đạt được

  // Hàm cập nhật tiến độ
  const updateProgress = (size) => {
    // Đảm bảo downloadedSize không vượt quá fileSize
    const newSize = Math.min(downloadedSize + size, fileSize);
    const actualAddedSize = newSize - downloadedSize;
    downloadedSize = newSize;

    const now = Date.now();
    if (now - lastLogTime > PROGRESS_UPDATE_INTERVAL) {
      const progress = Math.min((downloadedSize / fileSize) * 100, 100).toFixed(
        2
      );
      const downloadedMB = (downloadedSize / (1024 * 1024)).toFixed(2);
      const totalMB = (fileSize / (1024 * 1024)).toFixed(2);

      // Tính tốc độ tải (MB/s)
      const sizeDiff = downloadedSize - lastCheckedSize;
      const timeDiff = (now - lastLogTime) / 1000;
      const speedMBps =
        timeDiff > 0 ? (sizeDiff / 1024 / 1024 / timeDiff).toFixed(2) : 0;

      // Cập nhật lịch sử tốc độ
      speedHistory.push(parseFloat(speedMBps));
      if (speedHistory.length > SPEED_HISTORY_SIZE) {
        speedHistory.shift();
      }

      // Cập nhật tốc độ cao nhất
      highestSpeed = Math.max(highestSpeed, parseFloat(speedMBps));

      // Tính tốc độ trung bình
      const avgSpeed =
        speedHistory.reduce((sum, speed) => sum + speed, 0) /
        speedHistory.length;

      // Ước tính thời gian còn lại
      const elapsedSec = (now - startTime) / 1000;
      const remainingBytes = fileSize - downloadedSize;
      const avgSpeedBps = downloadedSize / elapsedSec;
      const remainingSec =
        avgSpeedBps > 0 ? Math.round(remainingBytes / avgSpeedBps) : 0;

      // Điều chỉnh số lượng kết nối dựa trên tốc độ (tối ưu lại thuật toán)
      if (now - lastSpeedCheck.time > 5000) {
        // Kiểm tra mỗi 5 giây
        const speedDiff = parseFloat(speedMBps) - lastAverageSpeed;
        const speedChangePercent =
          lastAverageSpeed > 0 ? (speedDiff / lastAverageSpeed) * 100 : 0;

        // Nếu đã phát hiện tốc độ cao nhất trước đó và hiện tại tốc độ giảm hơn 30%
        if (highestSpeed > 0 && parseFloat(speedMBps) < highestSpeed * 0.7) {
          // Nếu giảm đáng kể, quay lại giá trị ban đầu và tăng dần lại
          dynamicLimit = INITIAL_PARALLEL_CHUNKS;
          conditionalLog(
            `Tốc độ giảm đáng kể, đặt lại số kết nối về ${dynamicLimit}`,
            1
          );
        }
        // Nếu tốc độ tăng liên tục và chưa đạt giới hạn, tăng số kết nối
        else if (
          speedChangePercent > 5 &&
          dynamicLimit < MAX_PARALLEL_CHUNKS &&
          consecutiveErrors === 0
        ) {
          // Tăng kết nối nhanh hơn khi tốc độ tăng
          dynamicLimit = Math.min(dynamicLimit + 3, MAX_PARALLEL_CHUNKS);
          conditionalLog(
            `Tăng số kết nối lên ${dynamicLimit} (tốc độ tăng ${speedChangePercent.toFixed(
              1
            )}%)`,
            1
          );
        }
        // Nếu tốc độ giảm đáng kể
        else if (
          speedChangePercent < -15 &&
          dynamicLimit > INITIAL_PARALLEL_CHUNKS / 2
        ) {
          dynamicLimit = Math.max(
            dynamicLimit - 3,
            Math.floor(INITIAL_PARALLEL_CHUNKS / 2)
          );
          conditionalLog(
            `Giảm số kết nối xuống ${dynamicLimit} (tốc độ giảm ${Math.abs(
              speedChangePercent
            ).toFixed(1)}%)`,
            1
          );
        }

        lastAverageSpeed = parseFloat(speedMBps);
        lastSpeedCheck = { time: now, size: downloadedSize };
      }

      process.stdout.write(
        `\rĐã tải: ${progress}% (${downloadedMB}MB/${totalMB}MB) - Tốc độ: ${speedMBps} MB/s - TB: ${avgSpeed.toFixed(
          2
        )} MB/s - Còn lại: ${formatTime(
          remainingSec
        )} - Kết nối: ${activeConnections}/${dynamicLimit}`
      );

      lastLogTime = now;
      lastCheckedSize = downloadedSize;
    }
  };

  // Hàm ghi chunk vào stream đầu ra theo thứ tự
  const writeChunksInOrder = async () => {
    while (chunkBuffers.has(nextChunkToWrite)) {
      const buffer = chunkBuffers.get(nextChunkToWrite);
      outputStream.write(buffer);
      chunkBuffers.delete(nextChunkToWrite);
      nextChunkToWrite++;
    }
  };

  // Hàm tải một chunk
  const processChunk = async (chunkIndex) => {
    if (processedChunks.has(chunkIndex)) {
      return; // Bỏ qua nếu chunk đã được xử lý
    }

    const chunk = chunks[chunkIndex];
    activeConnections++;

    try {
      // Giảm log chi tiết
      conditionalLog(`Bắt đầu tải chunk ${chunkIndex + 1}/${chunks.length}`, 2);

      const buffer = await downloadChunk(
        drive,
        fileId,
        chunk.start,
        chunk.end,
        fileSize,
        chunkIndex,
        chunks.length
      );

      // Cập nhật tiến độ
      updateProgress(buffer.length);

      // Lưu buffer vào Map để ghi theo thứ tự
      chunkBuffers.set(chunkIndex, buffer);

      // Ghi các chunk theo thứ tự
      await writeChunksInOrder();

      // Đánh dấu chunk đã xử lý
      processedChunks.add(chunkIndex);

      // Cập nhật biến theo dõi lỗi/thành công
      consecutiveErrors = 0;
      consecutiveSuccess++;

      // Tăng số kết nối nếu liên tục thành công
      if (consecutiveSuccess > 5 && dynamicLimit < MAX_PARALLEL_CHUNKS) {
        dynamicLimit = Math.min(dynamicLimit + 1, MAX_PARALLEL_CHUNKS);
        conditionalLog(
          `Tăng kết nối lên ${dynamicLimit} (thành công liên tiếp)`,
          2
        );
        consecutiveSuccess = 0;
      }

      conditionalLog(`Hoàn thành chunk ${chunkIndex + 1}/${chunks.length}`, 2);
    } catch (error) {
      // Giảm log lỗi
      conditionalLog(
        `Lỗi khi tải chunk ${chunkIndex + 1}/${chunks.length}: ${
          error.message
        }`,
        1
      );

      // Cập nhật biến theo dõi lỗi
      consecutiveErrors++;
      consecutiveSuccess = 0;

      // Giảm số kết nối nếu liên tục gặp lỗi
      if (consecutiveErrors > 3 && dynamicLimit > 4) {
        dynamicLimit = Math.max(Math.floor(dynamicLimit * 0.75), 4);
        conditionalLog(`Giảm kết nối xuống ${dynamicLimit} (lỗi liên tiếp)`, 1);
        consecutiveErrors = 0;
      }

      // Nếu là lỗi rate limit, giảm mạnh số kết nối
      if (error.message.includes("403") || error.message.includes("429")) {
        dynamicLimit = Math.max(Math.floor(dynamicLimit * 0.5), 2);
        conditionalLog(
          `Giảm mạnh kết nối xuống ${dynamicLimit} (rate limit)`,
          1
        );
        await delay(5000); // Đợi 5 giây khi gặp rate limit
      }
    } finally {
      activeConnections--;
    }
  };

  // Hàm chính để tải tất cả các chunk
  const downloadAllChunks = async () => {
    let chunkIndex = 0;

    // Ưu tiên tải các chunk cuối cùng sớm hơn (hữu ích cho video)
    if (chunks.length > 50) {
      const LAST_CHUNKS_PRIORITY = 5;
      const priorityChunks = chunks
        .slice(-LAST_CHUNKS_PRIORITY)
        .map((_, i) => chunks.length - LAST_CHUNKS_PRIORITY + i);

      // Tải các chunk ưu tiên trước
      const priorityPromises = [];
      for (const priorityIndex of priorityChunks) {
        priorityPromises.push(processChunk(priorityIndex));
        await delay(CONNECTION_STAGGER_DELAY);
      }

      // Đợi các chunk ưu tiên hoàn thành
      await Promise.all(priorityPromises);
    }

    // Tải các chunk còn lại
    while (chunkIndex < chunks.length) {
      // Kiểm tra xem chunk đã được xử lý chưa
      if (!processedChunks.has(chunkIndex)) {
        // Nếu số kết nối hiện tại ít hơn giới hạn, tải thêm chunk
        if (activeConnections < dynamicLimit) {
          processChunk(chunkIndex);
          chunkIndex++;
          // Giảm độ trễ giữa các kết nối để tăng tốc
          await delay(CONNECTION_STAGGER_DELAY);
        } else {
          // Đợi một chút nếu đã đạt giới hạn kết nối
          await delay(50); // Giảm thời gian chờ từ 100ms xuống 50ms
        }
      } else {
        // Nếu chunk đã được xử lý, chuyển sang chunk tiếp theo
        chunkIndex++;
      }
    }

    // Đợi tất cả các kết nối hoàn thành
    while (activeConnections > 0) {
      await delay(50); // Giảm thời gian chờ từ 100ms xuống 50ms
    }

    // Đảm bảo tất cả các chunk đã được xử lý
    const missingChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      if (!processedChunks.has(i)) {
        missingChunks.push(i);
      }
    }

    // Tải lại các chunk bị thiếu
    if (missingChunks.length > 0) {
      conditionalLog(
        `Còn ${missingChunks.length} chunks bị thiếu, đang tải lại...`,
        1
      );

      for (const missingChunkIndex of missingChunks) {
        await processChunk(missingChunkIndex);
      }
    }

    // Kết thúc stream
    outputStream.end();
    console.log(
      "\nHoàn thành tải file với tốc độ cao nhất đạt được: " +
        highestSpeed +
        " MB/s"
    );
  };

  // Bắt đầu tải
  downloadAllChunks().catch((error) => {
    console.error("Lỗi khi tải file:", error);
    outputStream.destroy(error);
  });

  return outputStream;
}

// Hàm tải file nhỏ (không chia chunk)
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
    if (now - lastLogTime > 2000) {
      // Tăng từ 1s lên 2s để giảm log
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
        conditionalLog(
          `Lỗi khi tải file nhỏ (lần thử ${retryCount}/${MAX_SIMPLE_RETRIES}): ${error.message}`,
          1
        );

        if (retryCount >= MAX_SIMPLE_RETRIES) {
          outputStream.destroy(error);
          throw error;
        }

        // Chờ trước khi thử lại với tăng thời gian chờ theo cấp số mũ và độ ngẫu nhiên
        const jitter = Math.floor(Math.random() * 1000); // Độ ngẫu nhiên tối đa 1 giây
        const waitTime = RETRY_DELAY * Math.pow(2, retryCount) + jitter;
        conditionalLog(`Đợi ${waitTime}ms trước khi thử lại...`, 1);
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

// Hàm chính để tải file từ Google Drive
async function downloadFile(fileId, options = {}, tokens) {
  try {
    // Tạo Drive client
    const drive = createDriveClient(tokens);

    // Lấy thông tin file
    const metadata = await drive.files.get({
      fileId: fileId,
      supportsAllDrives: true,
      fields: "size,name,mimeType",
    });

    const fileSize = parseInt(metadata.data.size, 10);
    const fileName = metadata.data.name;
    const mimeType = metadata.data.mimeType;

    console.log(`Bắt đầu tải file: ${fileName}`);
    console.log(`Kích thước: ${formatSize(fileSize)}`);
    console.log(`Loại file: ${mimeType}`);
    console.log(
      `Sử dụng ${INITIAL_PARALLEL_CHUNKS} kết nối ban đầu, tối đa ${MAX_PARALLEL_CHUNKS} kết nối`
    );

    // Quyết định phương thức tải dựa trên kích thước file
    const SMALL_FILE_THRESHOLD = 20 * 1024 * 1024; // 20MB

    if (fileSize <= SMALL_FILE_THRESHOLD) {
      console.log("File nhỏ, tải trực tiếp không chia chunk");
      return downloadSmallFile(drive, fileId, options, fileSize);
    } else {
      console.log("File lớn, tải bằng nhiều kết nối song song");
      return downloadLargeFile(drive, fileId, fileSize, options);
    }
  } catch (error) {
    console.error("Lỗi khi tải file:", error);
    throw error;
  }
}

// Hàm lấy thông tin file
async function getFileMetadata(fileId, tokens) {
  try {
    // Tạo Drive client
    const drive = createDriveClient(tokens);

    // Lấy thông tin file
    const response = await drive.files.get({
      fileId: fileId,
      supportsAllDrives: true,
      fields: "*",
    });

    return response;
  } catch (error) {
    console.error("Lỗi khi lấy thông tin file:", error);
    throw error;
  }
}

// Hàm tải file và lưu vào đường dẫn cụ thể
async function downloadFileToPath(fileId, outputPath, options = {}, tokens) {
  try {
    // Tạo thư mục chứa file nếu chưa tồn tại
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Tải file
    const fileStream = await downloadFile(fileId, options, tokens);

    // Lưu file
    await pipeline(fileStream, fs.createWriteStream(outputPath));

    console.log(`Đã lưu file vào: ${outputPath}`);

    return outputPath;
  } catch (error) {
    console.error("Lỗi khi tải và lưu file:", error);
    throw error;
  }
}

module.exports = {
  downloadFile,
  getFileMetadata,
  downloadFileToPath,
};
