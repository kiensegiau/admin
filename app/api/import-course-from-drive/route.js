import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { readTokens } from "@/lib/tokenStorage";
import { encryptId } from "@/lib/encryption";
import {
  initializeDriveClient,
  getFolderInfo,
  listFolderContents,
} from "@/app/utils/serverDriveUtils";
import path from "path";
import os from "os";
import fs from "fs";
import axios from "axios";
import { pipeline } from "stream/promises";
// Import AWS SDK S3
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { refreshDriveToken, checkAndRefreshToken } from "@/lib/tokenRefresher";
import {
  findOneDocument,
  findDocuments,
  insertDocument,
  updateDocument,
  deleteDocument,
  ObjectId,
  connectToDatabase
} from '@/lib/db';

// Thêm import cho adapter
import {
  getOrCreateCourse,
  getOrCreateChapter,
  createChapter,
  getOrCreateLesson,
  createLesson,
  getOrCreateSubfolder,
  checkAndDeleteDuplicateFiles,
  checkExistingFile,
  addFileToLesson,
  synchronizeDeletedItems,
  getFileType,
  getOrCreateSubsubfolder,
} from './adapter-impl';

export const dynamic = "force-dynamic";

// Khởi tạo Wasabi client
const s3Client = new S3Client({
  region: process.env.WASABI_REGION || "ap-southeast-1", // Singapore region
  endpoint:
    process.env.WASABI_ENDPOINT || "https://s3.ap-southeast-1.wasabisys.com",
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.WASABI_BUCKET_NAME || "hocmai";

// Thêm cache để lưu trữ dữ liệu đã truy vấn
const cache = {
  courseData: {},
  fileChecks: {},
  dbConnection: null, // Cache kết nối database
  checkResults: {}    // Cache kết quả kiểm tra file
};

// Thêm cấu trúc dữ liệu để theo dõi các mục đã xử lý
const syncState = {
  processedItems: {
    chapters: new Set(),
    lessons: new Set(),
    files: new Set(),
    subfolders: new Set(),
    subsubfolders: new Set(),
  },
  needSync: false,
};

// Đưa syncState vào global để các hàm khác có thể truy cập
global.syncState = syncState;

// Hàm lấy ID từ Google Drive URL
function extractDriveId(url) {
  const patterns = [
    /\/folders\/([a-zA-Z0-9-_]+)/, // Format: folders/id
    /\/d\/([a-zA-Z0-9-_]+)/, // Format: d/id
    /id=([a-zA-Z0-9-_]+)/, // Format: id=id
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Hàm xử lý đường dẫn an toàn cho Wasabi
function sanitizeWasabiPath(path) {
  if (!path) return "";

  // Xử lý từng phần của đường dẫn
  const parts = path.split("/").map((part) => {
    if (!part) return "";

    // Thay vì loại bỏ dấu, chuyển toàn bộ ký tự không an toàn
    // thành mã hex để giữ lại nguyên nghĩa
    let sanitized = part;

    // Thay thế các ký tự không hợp lệ trên Wasabi
    sanitized = sanitized
      .replace(/[<>:"\/\\|?*\x00-\x1F]/g, "-") // Ký tự không hợp lệ trên hầu hết các hệ thống
      .replace(/\s+/g, "-") // Thay khoảng trắng bằng gạch ngang
      .replace(/-+/g, "-") // Loại bỏ nhiều gạch ngang liên tiếp
      .replace(/^-+|-+$/g, ""); // Loại bỏ gạch ngang ở đầu và cuối

    // Đảm bảo chiều dài an toàn cho mỗi phần của đường dẫn
    if (sanitized.length > 100) {
      sanitized = sanitized.substring(0, 100);
    }

    return sanitized;
  });

  // Loại bỏ các phần rỗng và giới hạn tổng chiều dài đường dẫn
  const result = parts.filter(Boolean).join("/");

  // Nếu đường dẫn quá dài, cắt bớt để đảm bảo an toàn
  if (result.length > 900) {
    // AWS S3 có giới hạn key 1024 ký tự
    console.warn(`Đường dẫn quá dài, đã cắt bớt: ${result.length} ký tự`);
    return result.substring(0, 900);
  }

  return result;
}

// Làm sạch tên file
function sanitizeFileName(fileName) {
  if (!fileName) return "untitled";

  // Thay thế các ký tự không hợp lệ với dấu gạch ngang
  const sanitized = fileName
    .replace(/[<>:"\\|?*\x00-\x1F]/g, "-")
    .replace(/\//g, "-") // Thay / bằng -
    .replace(/\s+/g, " ") // Giữ khoảng trắng nhưng gộp lại
    .trim();

  // Đảm bảo chiều dài an toàn
  if (sanitized.length > 150) {
    const parts = sanitized.split(".");
    const ext = parts.pop();
    let name = parts.join(".");
    name = name.substring(0, 145);
    return `${name}.${ext}`;
  }

  return sanitized;
}

// Hàm tạo key cố định cho file trên Wasabi
function createConsistentKey(fileId, fileName, folderPath = "") {
  // Sử dụng Google Drive fileId làm định danh cố định
  // fileId luôn bất biến với cùng một file trên Google Drive
  const sanitizedPath = sanitizeWasabiPath(folderPath);
  const sanitizedFile = sanitizeFileName(fileName);
  
  if (folderPath && folderPath !== "") {
    return `courses/${sanitizedPath}/${fileId}-${sanitizedFile}`;
  } else {
    return `courses/${fileId}-${sanitizedFile}`;
  }
}

// Hàm upload file từ Google Drive lên Wasabi
async function uploadToWasabi(
  drive,
  fileId,
  fileName,
  mimeType,
  folderPath = "",
  retryCount = 0
) {
  const MAX_RETRIES = 3;
  let tempDir;
  let tempFilePath;

  try {
    // Tạo key cố định cho file
    const consistentKey = createConsistentKey(fileId, fileName, folderPath);
    
    // Kiểm tra cache trước khi kiểm tra trên Wasabi
    if (cache.fileChecks[consistentKey]) {
      return {
        success: true,
        key: consistentKey,
        size: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        fileSize: "0",
        wasReused: true
      };
    }
    
    // Kiểm tra file đã tồn tại trên Wasabi chưa
    const fileExistsOnWasabi = await checkWasabiFile(consistentKey);
    if (fileExistsOnWasabi) {
      // Lưu kết quả vào cache
      cache.fileChecks[consistentKey] = true;
      // Trả về thông tin file đã tồn tại
      return {
        success: true,
        key: consistentKey,
        size: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        fileSize: "0",
        wasReused: true
      };
    }
    
    tempDir = path.join(os.tmpdir(), "hocmai-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Chỉ làm sạch tên file để lưu vào bộ nhớ tạm, tránh lỗi hệ thống tệp
    const sanitizedFileName = sanitizeFileName(fileName);
    tempFilePath = path.join(tempDir, sanitizedFileName);

    console.log(`Đang tải file ${fileName} từ Google Drive...`);

    // Biến theo dõi tốc độ tải
    const downloadStartTime = Date.now();
    let lastProgressTime = Date.now();
    let downloadedBytes = 0;
    let totalBytes = 0;

    // Sử dụng retryWithNewToken để đảm bảo token không hết hạn khi tải file lớn
    const fileStream = await drive.files.get(
      {
        fileId: fileId,
        alt: "media",
      },
      { responseType: "stream" }
    );

    // Lấy thông tin file để biết kích thước
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: "size,name",
    });

    totalBytes = parseInt(fileInfo.data.size, 10) || 0;
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    // Đối với file lớn, sử dụng stream để download
    const writer = fs.createWriteStream(tempFilePath);

    // Theo dõi tiến trình tải - giảm logging quá chi tiết
    fileStream.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;

      // Hiển thị tiến trình mỗi 2 giây hoặc khi tải xong (thay vì 1 giây)
      const now = Date.now();
      if (now - lastProgressTime > 2000 || downloadedBytes >= totalBytes) {
        const percent = totalBytes
          ? Math.round((downloadedBytes / totalBytes) * 100)
          : 0;
        const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(2);
        const elapsedSecs = ((now - downloadStartTime) / 1000).toFixed(1);
        const currentSpeed = (downloadedMB / elapsedSecs).toFixed(2);

        console.log(
          `Tải ${fileName}: ${percent}% (${downloadedMB}/${totalMB} MB) @ ${currentSpeed} MB/s`
        );
        lastProgressTime = now;
      }
    });

    // Thêm xử lý lỗi cho stream
    fileStream.data.on("error", (err) => {
      writer.end();
      throw new Error(`Lỗi khi tải file: ${err.message}`);
    });

    try {
      await pipeline(fileStream.data, writer);
    } catch (err) {
      console.error(`Lỗi khi tải file về: ${err.message}`);
      // Nếu lỗi khi download, thử lại
      if (retryCount < MAX_RETRIES) {
        console.log(`Thử lại lần ${retryCount + 1}/${MAX_RETRIES}...`);
        // Đảm bảo đóng writer trước khi thử lại
        writer.end();
        // Thử lại toàn bộ quá trình
        return uploadToWasabi(
          drive,
          fileId,
          fileName,
          mimeType,
          folderPath,
          retryCount + 1
        );
      }
      throw err;
    }

    // Kiểm tra file tồn tại sau khi tải
    if (!fs.existsSync(tempFilePath)) {
      throw new Error(`File tạm không tồn tại sau khi tải: ${tempFilePath}`);
    }

    const downloadEndTime = Date.now();
    const downloadDuration = (downloadEndTime - downloadStartTime) / 1000; // chuyển sang giây

    // Đọc kích thước file
    const stats = fs.statSync(tempFilePath);
    const fileSizeInBytes = stats.size;
    const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

    // Tính tốc độ tải (MB/s)
    const downloadSpeed =
      downloadDuration > 0 ? (fileSizeInMB / downloadDuration).toFixed(2) : 0;

    console.log(`File đã được tải về: ${tempFilePath}`);
    console.log(
      `Kích thước: ${fileSizeInMB.toFixed(
        2
      )} MB | Thời gian tải: ${downloadDuration.toFixed(
        2
      )}s | Tốc độ: ${downloadSpeed} MB/s`
    );

    // Đọc file để upload lên Wasabi
    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(tempFilePath);
    } catch (readErr) {
      console.error(`Lỗi khi đọc file tạm: ${readErr.message}`);
      if (retryCount < MAX_RETRIES) {
        console.log(`Thử lại lần ${retryCount + 1}/${MAX_RETRIES}...`);
        return uploadToWasabi(
          drive,
          fileId,
          fileName,
          mimeType,
          folderPath,
          retryCount + 1
        );
      }
      throw readErr;
    }

    // Sử dụng key cố định thay vì tạo mới
    const key = consistentKey;

    console.log(`Tạo key Wasabi: ${key}`);

    // Biến theo dõi tốc độ upload
    const uploadStartTime = Date.now();
    console.log(`Bắt đầu upload lên Wasabi (${fileSizeInMB.toFixed(2)} MB)...`);

    // Upload lên Wasabi
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    try {
      await s3Client.send(command);

      // Xác minh file đã được tải lên thành công
      try {
        const checkCommand = new HeadObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        const headResponse = await s3Client.send(checkCommand);
        console.log(
          `Xác minh upload thành công: ${key} (${headResponse.ContentLength} bytes)`
        );
      } catch (verifyErr) {
        console.warn(
          `Không thể xác minh file sau khi upload: ${key}`,
          verifyErr.name
        );
        // Tiếp tục xử lý vì chúng ta đã tải lên, có thể là vấn đề trễ hoặc nhất quán
      }
    } catch (uploadErr) {
      console.error(`Lỗi khi upload lên Wasabi: ${uploadErr.message}`);
      if (retryCount < MAX_RETRIES) {
        console.log(`Thử lại lần ${retryCount + 1}/${MAX_RETRIES}...`);
        return uploadToWasabi(
          drive,
          fileId,
          fileName,
          mimeType,
          folderPath,
          retryCount + 1
        );
      }
      throw uploadErr;
    }

    const uploadEndTime = Date.now();
    const uploadDuration = (uploadEndTime - uploadStartTime) / 1000; // chuyển sang giây

    // Tính tốc độ upload (MB/s)
    const uploadSpeed =
      uploadDuration > 0 ? (fileSizeInMB / uploadDuration).toFixed(2) : 0;

    console.log(`File đã được upload lên Wasabi: ${key}`);
    console.log(
      `Thời gian upload: ${uploadDuration.toFixed(
        2
      )}s | Tốc độ: ${uploadSpeed} MB/s`
    );

    // Xóa file tạm
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (unlinkErr) {
      console.warn(`Không thể xóa file tạm: ${unlinkErr.message}`);
      // Tiếp tục xử lý, không cần retry vì đã upload thành công
    }

    // Trả về key để lưu trong database và thông tin tốc độ
    return {
      success: true,
      key: key,
      size: fileBuffer.length,
      downloadSpeed: downloadSpeed,
      uploadSpeed: uploadSpeed,
      fileSize: fileSizeInMB.toFixed(2),
    };
  } catch (error) {
    console.error("Lỗi khi upload file lên Wasabi:", error);

    // Cố gắng xóa file tạm nếu tồn tại
    try {
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (unlinkErr) {
      console.warn(`Không thể xóa file tạm sau lỗi: ${unlinkErr.message}`);
    }

    // Nếu lỗi ENOENT hoặc lỗi khác liên quan đến file system và chưa vượt quá số lần thử lại
    if (
      (error.code === "ENOENT" || error.message.includes("no such file")) &&
      retryCount < MAX_RETRIES
    ) {
      console.log(
        `Lỗi file không tìm thấy, thử lại lần ${
          retryCount + 1
        }/${MAX_RETRIES}...`
      );

      // Tạm dừng để hệ thống có thể giải phóng tài nguyên
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Thử lại từ đầu
      return uploadToWasabi(
        drive,
        fileId,
        fileName,
        mimeType,
        folderPath,
        retryCount + 1
      );
    }

    return {
      success: false,
      error: error.message,
      retryCount,
    };
  }
}

/**
 * Tải file từ Google Drive
 * @param {Object} drive - Drive service
 * @param {string} fileId - ID file Google Drive cần tải
 * @returns {Promise<Object>} - Kết quả tải file
 */
async function downloadFileFromDrive(drive, fileId) {
  try {
    console.log(`Đang tải file từ Google Drive với ID: ${fileId}`);
    
    // Tạo thư mục tạm nếu chưa tồn tại
    const tempDir = path.join(os.tmpdir(), "hocmai-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Lấy thông tin file để biết tên và kích thước
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: "name,size,mimeType"
    });
    
    const fileName = fileInfo.data.name || `file-${fileId}`;
    const sanitizedFileName = sanitizeFileName(fileName);
    const tempFilePath = path.join(tempDir, sanitizedFileName);
    
    // Biến theo dõi tốc độ tải
    const downloadStartTime = Date.now();
    let downloadedBytes = 0;
    const totalBytes = parseInt(fileInfo.data.size, 10) || 0;
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    
    console.log(`Bắt đầu tải file: ${fileName} (${totalMB} MB)`);
    
    // Tải file từ Drive
    const response = await drive.files.get(
      {
        fileId: fileId,
        alt: "media"
      },
      { responseType: "stream" }
    );
    
    // Lưu file vào thư mục tạm
    const writer = fs.createWriteStream(tempFilePath);
    
    // Xử lý stream
    await new Promise((resolve, reject) => {
      response.data
        .on("data", chunk => {
          downloadedBytes += chunk.length;
        })
        .on("end", () => {
          console.log(`Tải file hoàn tất: ${fileName}`);
          resolve();
        })
        .on("error", err => {
          reject(err);
        })
        .pipe(writer);
    });
    
    // Tính tốc độ tải
    const downloadEndTime = Date.now();
    const downloadDuration = (downloadEndTime - downloadStartTime) / 1000; // chuyển sang giây
    const downloadSpeed = (totalMB / downloadDuration).toFixed(2);
    
    console.log(`Đã tải xong file ${fileName} (${totalMB} MB)`);
    console.log(`Thời gian tải: ${downloadDuration.toFixed(2)}s | Tốc độ: ${downloadSpeed} MB/s`);
    
    // Đọc file vào buffer để upload lên Wasabi
    const fileBuffer = fs.readFileSync(tempFilePath);
    
    return {
      success: true,
      data: fileBuffer,
      fileName: fileName,
      mimeType: fileInfo.data.mimeType,
      size: totalBytes,
      downloadSpeed: downloadSpeed
    };
  } catch (error) {
    console.error(`Lỗi khi tải file từ Google Drive: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Xử lý các file trong folder - phiên bản song song
 * @param {Object} drive - Drive service
 * @param {Array} files - Danh sách file
 * @param {string} courseId - ID khóa học
 * @param {string} chapterId - ID chapter
 * @param {string} lessonId - ID lesson
 * @param {string} parentType - Loại parent (lesson/subfolder/subsubfolder)
 * @param {string} parentPath - Đường dẫn parent
 * @param {string} subfolderId - ID của subfolder (nếu có)
 * @param {string} subsubfolderId - ID của subsubfolder (nếu có)
 * @returns {Promise<{processed: Array, failed: Array}>}
 */
async function processFiles(
  drive,
  files,
  courseId,
  chapterId,
  lessonId,
  parentType = "lesson",
  parentPath = "",
  subfolderId = null,
  subsubfolderId = null
) {
  if (!files || files.length === 0) {
    return { processed: [], failed: [] };
  }

  // Mảng các tệp đã được xử lý và thất bại
  const processedFiles = [];
  const failedFiles = [];

  console.log(`Xử lý song song ${files.length} file trong ${parentType}`);

  // Lọc các file Google Workspace
  const validFiles = files.filter(file => {
    if (file.mimeType.startsWith("application/vnd.google-apps") && 
        file.mimeType !== "application/vnd.google-apps.folder") {
      return false;
    }
    return true;
  });

  if (validFiles.length === 0) {
    return { processed: [], failed: [] };
  }

  // Tạo keys cho tất cả file
  const fileKeysMap = {};
  validFiles.forEach(file => {
    fileKeysMap[file.id] = createConsistentKey(file.id, file.name, parentPath);
  });

  // Tạo cacheKey cho nhóm files để tránh kiểm tra DB lặp lại
  const cacheGroupKey = `${courseId}:${chapterId}:${lessonId}:${subfolderId || ''}:${subsubfolderId || ''}`;
  
  // Kiểm tra cache cho kết quả kiểm tra database
  if (!cache.checkResults[cacheGroupKey]) {
    cache.checkResults[cacheGroupKey] = {};
  }
  
  // Chỉ kiểm tra DB cho các file chưa có trong cache
  const filesToCheck = validFiles.filter(file => 
    !cache.checkResults[cacheGroupKey][file.name.toLowerCase()]
  );
  
  // 1. Kiểm tra song song các file chưa có trong cache
  let dbResults = [];
  if (filesToCheck.length > 0) {
    console.log(`Kiểm tra ${filesToCheck.length} file mới trong database...`);
    dbResults = await Promise.all(
      filesToCheck.map(file => 
        checkExistingFile(courseId, chapterId, lessonId, file.name, subfolderId, subsubfolderId)
      )
    );
    
    // Cập nhật cache với kết quả mới
    filesToCheck.forEach((file, index) => {
      cache.checkResults[cacheGroupKey][file.name.toLowerCase()] = dbResults[index];
    });
  }
  
  // Map kết quả truy vấn DB từ cache và kết quả mới
  const dbExistsMap = {};
  validFiles.forEach(file => {
    // Lấy từ cache hoặc từ kết quả kiểm tra mới
    dbExistsMap[file.id] = cache.checkResults[cacheGroupKey][file.name.toLowerCase()];
  });
  
  // Thu thập các key cần kiểm tra trên Wasabi
  const keysToCheck = new Set();
  
  // Thêm key trong DB và key mới vào danh sách cần kiểm tra
  validFiles.forEach(file => {
    // Nếu file có trong DB và có key Wasabi, kiểm tra key đó
    if (dbExistsMap[file.id]?.storage?.provider === 'wasabi') {
      keysToCheck.add(dbExistsMap[file.id].storage.key);
    } else {
      // Chỉ kiểm tra key mới khi không có key trong DB
      keysToCheck.add(fileKeysMap[file.id]);
    }
  });
  
  // 2. Kiểm tra song song tất cả key trên Wasabi
  console.log(`Kiểm tra ${keysToCheck.size} key trên Wasabi...`);
  const keysToCheckArray = [...keysToCheck].filter(key => cache.fileChecks[key] === undefined);
  const wasabiResults = [];
  
  // Chỉ kiểm tra các key chưa có trong cache
  if (keysToCheckArray.length > 0) {
    const newResults = await Promise.all(
      keysToCheckArray.map(async key => {
        const exists = await checkWasabiFile(key);
        // Lưu kết quả vào cache
        cache.fileChecks[key] = exists;
        return { key, exists };
      })
    );
    wasabiResults.push(...newResults);
  }
  
  // Thêm kết quả từ cache
  [...keysToCheck].forEach(key => {
    if (cache.fileChecks[key] !== undefined && !wasabiResults.some(r => r.key === key)) {
      wasabiResults.push({ key, exists: cache.fileChecks[key] });
    }
  });
  
  // Map kết quả kiểm tra Wasabi
  const wasabiExistsMap = {};
  wasabiResults.forEach(result => {
    wasabiExistsMap[result.key] = result.exists;
  });
  
  // 3. Phân loại files thành các nhóm xử lý
  const filesToUpload = [];   // Files cần upload mới
  const filesToUpdate = [];   // Files đã có trên Wasabi nhưng cần cập nhật DB
  const filesToSkip = [];     // Files đã có đủ trong DB và Wasabi
  
  validFiles.forEach(file => {
    const dbFile = dbExistsMap[file.id];
    const newKey = fileKeysMap[file.id];
    
    // Trường hợp 1: File đã có trong DB và key tồn tại trên Wasabi
    if (dbFile?.storage?.provider === 'wasabi' && wasabiExistsMap[dbFile.storage.key]) {
      filesToSkip.push(file);
    }
    // Trường hợp 2: File tồn tại trên Wasabi với key mới nhưng không có trong DB hoặc key cũ không tồn tại
    else if (wasabiExistsMap[newKey]) {
      filesToUpdate.push(file);
    }
    // Trường hợp 3: File không tồn tại, cần upload mới
    else {
      filesToUpload.push(file);
    }
  });
  
  console.log(`Phân loại: ${filesToSkip.length} bỏ qua, ${filesToUpdate.length} cập nhật DB, ${filesToUpload.length} upload mới`);
  
  // 4. Upload song song các file cần tải lên (tăng số lượng file upload cùng lúc)
  const CONCURRENT_UPLOADS = 8; // Tăng lên 8 file upload cùng lúc (trước đó là 5)
  const uploadResults = [];
  
  if (filesToUpload.length > 0) {
    console.log(`Bắt đầu upload song song ${filesToUpload.length} file (${CONCURRENT_UPLOADS} file cùng lúc)...`);
    
    // Sắp xếp file theo kích thước để dễ quản lý tài nguyên
    const sortedFiles = [...filesToUpload].sort((a, b) => {
      const sizeA = parseInt(a.size || 0);
      const sizeB = parseInt(b.size || 0);
      return sizeA - sizeB; // Xử lý file nhỏ trước
    });
    
    for (let i = 0; i < sortedFiles.length; i += CONCURRENT_UPLOADS) {
      const batch = sortedFiles.slice(i, i + CONCURRENT_UPLOADS);
      console.log(`Upload batch ${Math.floor(i/CONCURRENT_UPLOADS) + 1}/${Math.ceil(sortedFiles.length/CONCURRENT_UPLOADS)}`);
      
      const batchResults = await Promise.all(
        batch.map(file => 
          uploadToWasabi(drive, file.id, file.name, file.mimeType, parentPath)
        )
      );
      
      uploadResults.push(...batchResults);
    }
  }
  
  // Xử lý kết quả upload
  const successfulUploads = [];
  const failedUploads = [];
  
  uploadResults.forEach((result, index) => {
    const file = filesToUpload[index];
    if (result.success) {
      successfulUploads.push({ file, result });
    } else {
      failedUploads.push({ file, error: result.error || "Lỗi không xác định" });
      failedFiles.push({ ...file, error: result.error || "Lỗi không xác định" });
    }
  });
  
  // 5. Cập nhật database song song cho tất cả các file
  console.log(`Cập nhật database cho ${successfulUploads.length + filesToUpdate.length} file...`);
  
  const dbOperations = [
    // File đã upload thành công
    ...successfulUploads.map(({ file, result }) => {
      return addFileToDatabase(
        courseId, chapterId, lessonId,
        {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          type: getFileType(file.mimeType),
          modifiedTime: file.modifiedTime,
          size: file.size || "0",
          storage: {
            provider: "wasabi",
            key: result.key,
            size: parseInt(file.size || "0"),
            uploadTime: new Date().toISOString(),
          }
        },
        parentType, parentPath, subfolderId, subsubfolderId
      );
    }),
    
    // File đã có trên Wasabi, cần cập nhật DB
    ...filesToUpdate.map(file => {
      return addFileToDatabase(
        courseId, chapterId, lessonId,
        {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          type: getFileType(file.mimeType),
          modifiedTime: file.modifiedTime,
          size: file.size || "0",
          storage: {
            provider: "wasabi",
            key: fileKeysMap[file.id],
            size: parseInt(file.size || "0"),
            uploadTime: new Date().toISOString(),
          }
        },
        parentType, parentPath, subfolderId, subsubfolderId
      );
    })
  ];
  
  if (dbOperations.length > 0) {
    try {
      await Promise.all(dbOperations);
      console.log(`Đã cập nhật database thành công cho ${dbOperations.length} file`);
    } catch (error) {
      console.error(`Lỗi khi cập nhật database: ${error.message}`);
    }
  }
  
  // 6. Đánh dấu tất cả file đã xử lý
  const processedAll = [...filesToSkip, ...filesToUpdate];
  successfulUploads.forEach(({ file }) => processedAll.push(file));
  
  processedAll.forEach(file => {
    global.syncState.processedItems.files.add(file.id);
    processedFiles.push(file);
  });
  
  // Cập nhật trạng thái đồng bộ
  global.syncState.needSync = global.syncState.needSync || processedFiles.length > 0;
  
  console.log(`Kết quả xử lý files: ${processedFiles.length} thành công, ${failedFiles.length} thất bại.`);
  
  return {
    processed: processedFiles,
    failed: failedFiles
  };
}

/**
 * Hàm trợ giúp thêm file vào database theo đúng vị trí
 * @param {string} courseId - ID khóa học
 * @param {string} chapterId - ID chapter
 * @param {string} lessonId - ID lesson
 * @param {object} fileData - Dữ liệu file cần thêm
 * @param {string} parentType - Loại parent (lesson/subfolder/subsubfolder)
 * @param {string} parentPath - Đường dẫn parent
 * @param {string} subfolderId - ID của subfolder (nếu có)
 * @param {string} subsubfolderId - ID của subsubfolder (nếu có)
 */
async function addFileToDatabase(
  courseId,
  chapterId,
  lessonId,
  fileData,
  parentType,
  parentPath = "",
  subfolderId = null,
  subsubfolderId = null
) {
  let result;
  
  // Xử lý theo đúng cấp thư mục
  if (subsubfolderId && subfolderId) {
    // Thêm vào subsubfolder
    result = await addFileToLesson(
      courseId,
      chapterId,
      lessonId,
      fileData,
      subfolderId,
      subsubfolderId
    );
    console.log(`Đã thêm file ${fileData.name} vào subsubfolder trong database.`);
  } else if (subfolderId || parentType === "subfolder") {
    // Thêm vào subfolder
    if (!subfolderId) {
      // Nếu không có subfolderId, tìm hoặc tạo subfolder
      const subfolderName = 
        parentType === "subfolder" && parentPath
          ? parentPath.split("/").pop()
          : "Other Files";
          
      if (subfolderName) {
        subfolderId = await getOrCreateSubfolder(
          courseId,
          chapterId,
          lessonId,
          subfolderName
        );
        global.syncState.processedItems.subfolders.add(subfolderId);
      }
    }
    
    result = await addFileToLesson(
      courseId,
      chapterId,
      lessonId,
      fileData,
      subfolderId
    );
    console.log(`Đã thêm file ${fileData.name} vào subfolder trong database.`);
  } else {
    // Thêm vào lesson
    result = await addFileToLesson(
      courseId,
      chapterId,
      lessonId,
      fileData
    );
    console.log(`Đã thêm file ${fileData.name} vào lesson trong database.`);
  }
  
  return result;
}

async function processFolder(
  drive,
  folderId,
  courseId,
  parentType = "course",
  parentId = null,
  lessonId = null,
  parentPath = "",
  courseName = null,
  subfolderId = null
) {
  try {
    // Đảm bảo rằng syncState đã được khởi tạo
    if (!global.syncState) {
      global.syncState = {
        processedItems: {
          chapters: new Set(),
          lessons: new Set(),
          files: new Set(),
          subfolders: new Set(),
          subsubfolders: new Set()
        },
        needSync: false
      };
    }
    
    // Đảm bảo subsubfolders tồn tại
    if (!global.syncState.processedItems.subsubfolders) {
      global.syncState.processedItems.subsubfolders = new Set();
    }
    
    // Lấy tên khóa học nếu chưa có
    if (!courseName) {
      const courseData = await findOneDocument("courses", { _id: new ObjectId(courseId) });
      if (courseData) {
        courseName = courseData.title || "Unknown Course";
      } else {
        courseName = "Unknown Course";
      }
    }

    // Xử lý đường dẫn: nếu là lần gọi đầu tiên, bắt đầu với tên khóa học
    let currentPath = parentPath;
    if (parentType === "course") {
      // Bắt đầu đường dẫn với tên khóa học
      currentPath = courseName;
    } else if (parentPath === "") {
      // Trường hợp đặc biệt khi đường dẫn rỗng nhưng không phải là thư mục gốc
      currentPath = courseName;
    }

    console.log(`\n=== Bắt đầu xử lý thư mục ${currentPath || "gốc"} (${parentType}) ===`);
    console.log(`CourseId: ${courseId}, FolderId: ${folderId}, LessonId: ${lessonId || 'không có'}`);
    
    if (subfolderId) {
      console.log(`SubfolderId: ${subfolderId}`);
    }

    const files = await listFolderContents(drive, folderId);
    const folders = files.filter(
      (f) => f.mimeType === "application/vnd.google-apps.folder"
    );
    const documents = files.filter(
      (f) => f.mimeType !== "application/vnd.google-apps.folder"
    );

    console.log(`Tìm thấy ${folders.length} thư mục con và ${documents.length} file`);

    // Xử lý các thư mục con - đồng nhất cách xử lý cho tất cả các cấp
    // Xử lý theo batch để tăng tốc độ
    const BATCH_SIZE = 5; // Xử lý 5 thư mục con cùng lúc
    
    for (let i = 0; i < folders.length; i += BATCH_SIZE) {
      const folderBatch = folders.slice(i, i + BATCH_SIZE);
      const folderPromises = [];
      
      for (const folder of folderBatch) {
        const folderName = folder.name;
        const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        
        if (parentType === "course") {
          // Course -> Chapter
          folderPromises.push((async () => {
            const chapter = await getOrCreateChapter(courseId, folderName);
            global.syncState.processedItems.chapters.add(chapter.id);
            
            console.log(`Chapter: ${folderName} (ID: ${chapter.id})`);
            
            return processFolder(
              drive,
              folder.id,
              courseId,
              "chapter",
              chapter.id,
              null,
              newPath,
              courseName
            );
          })());
        } 
        else if (parentType === "chapter") {
          // Chapter -> Lesson
          folderPromises.push((async () => {
            const lesson = await getOrCreateLesson(courseId, parentId, folderName);
            global.syncState.processedItems.lessons.add(lesson.id);
            
            console.log(`Lesson: ${folderName} (ID: ${lesson.id})`);
            
            return processFolder(
              drive,
              folder.id,
              courseId,
              "lesson",
              parentId,
              lesson.id,
              newPath,
              courseName
            );
          })());
        } 
        else if (parentType === "lesson" && lessonId) {
          // Lesson -> Subfolder
          folderPromises.push((async () => {
            const newSubfolderId = await getOrCreateSubfolder(
              courseId,
              parentId,
              lessonId,
              folderName
            );
            global.syncState.processedItems.subfolders.add(newSubfolderId);
            
            console.log(`Subfolder: ${folderName} (ID: ${newSubfolderId})`);
  
            return processFolder(
              drive,
              folder.id,
              courseId,
              "subfolder",
              parentId,
              lessonId,
              newPath,
              courseName,
              newSubfolderId
            );
          })());
        } 
        else if (parentType === "subfolder" && lessonId && subfolderId) {
          // Subfolder -> Subsubfolder
          folderPromises.push((async () => {
            console.log(`Xử lý subsubfolder "${folderName}"`);
            
            const subsubfolderId = await getOrCreateSubsubfolder(
              courseId,
              parentId,
              lessonId,
              subfolderId,
              folderName
            );
            global.syncState.processedItems.subsubfolders.add(subsubfolderId);
            
            // Lấy và xử lý các file trong subsubfolder
            const subsubfolderFiles = await listFolderContents(drive, folder.id);
            const subsubfolderDocuments = subsubfolderFiles.filter(
              (f) => f.mimeType !== "application/vnd.google-apps.folder"
            );
            
            // Lọc các file hợp lệ
            const validFiles = subsubfolderDocuments.filter(file => {
              const type = getFileType(file.mimeType);
              return type !== "other";
            });
            
            if (validFiles.length > 0) {
              // Đánh dấu các file đã xử lý vào syncState
              validFiles.forEach(file => {
                global.syncState.processedItems.files.add(file.id);
              });
              
              // Xử lý các file trong subsubfolder
              return processFiles(
                drive,
                validFiles,
                courseId,
                parentId,
                lessonId,
                "subsubfolder",
                newPath,
                subfolderId,
                subsubfolderId
              );
            }
          })());
        }
      }
      
      // Đợi tất cả các promise xử lý batch folder hoàn tất
      await Promise.all(folderPromises);
    }

    // Xử lý các file trong thư mục hiện tại (không đổi logic này)
    if ((parentType === "lesson" || parentType === "subfolder") && lessonId) {
      const validFiles = documents.filter(file => {
        const type = getFileType(file.mimeType);
        return type !== "other";
      });

      if (validFiles.length > 0) {
        console.log(`Xử lý ${validFiles.length} file trong thư mục "${currentPath}" (${parentType})`);
        
        // Đánh dấu các file đã xử lý vào syncState
        validFiles.forEach(file => {
          global.syncState.processedItems.files.add(file.id);
        });
        
        // Truyền đường dẫn thư mục khi gọi processFiles
        await processFiles(
          drive,
          validFiles,
          courseId,
          parentId,
          lessonId,
          parentType,
          currentPath,
          subfolderId
        );
      } else {
        console.log(`Không có file hợp lệ trong thư mục "${currentPath}"`);
      }
    }

    console.log(`=== Kết thúc xử lý thư mục ${currentPath || "gốc"} (${parentType}) ===\n`);
  } catch (error) {
    console.error(`Lỗi khi xử lý thư mục ${parentPath || "gốc"} (${parentType}):`, error);
    throw error;
  }
}

// Xóa file từ Wasabi
async function deleteFromWasabi(key, retryCount = 0) {
  if (!key) {
    console.warn("Không có key file để xóa từ Wasabi");
    return false;
  }

  const MAX_RETRIES = 2;
  
  try {
    console.log(`Đang xóa file từ Wasabi với key: ${key}`);

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    console.log(`Đã xóa file từ Wasabi thành công: ${key}`);
    return true;
  } catch (error) {
    console.error(`Lỗi khi xóa file từ Wasabi (${key}):`, error);
    
    // Thử lại nếu chưa vượt quá số lần thử
    if (retryCount < MAX_RETRIES) {
      console.log(`Thử xóa lại lần ${retryCount + 1}/${MAX_RETRIES}...`);
      // Đợi 500ms trước khi thử lại
      await new Promise(resolve => setTimeout(resolve, 500));
      return deleteFromWasabi(key, retryCount + 1);
    }
    
    // Nếu đã vượt quá số lần thử, kiểm tra xem file có tồn tại không
    try {
      const checkCommand = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      
      try {
        await s3Client.send(checkCommand);
        console.warn(`File vẫn tồn tại trên Wasabi sau ${MAX_RETRIES + 1} lần thử xóa: ${key}`);
        // File vẫn tồn tại
        return false;
      } catch (err) {
        // Nếu lỗi NotFound thì có nghĩa là file đã bị xóa hoặc không tồn tại
        if (err.name === 'NotFound' || err.Code === 'NotFound' || err.name === 'NoSuchKey') {
          console.log(`File không còn tồn tại trên Wasabi: ${key} (có thể đã bị xóa trước đó)`);
          return true;
        }
        console.warn(`Không thể kiểm tra tồn tại của file: ${key} - ${err.message}`);
        return false;
      }
    } catch (checkError) {
      console.error(`Lỗi khi kiểm tra file sau khi xóa thất bại: ${checkError.message}`);
      return false;
    }
  }
}

// Kiểm tra file tồn tại trên Wasabi
async function checkWasabiFile(key) {
  if (!key) {
    return false;
  }

  // Kiểm tra cache trước
  if (cache.fileChecks[key] !== undefined) {
    return cache.fileChecks[key];
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      await s3Client.send(command);
      // Lưu kết quả vào cache
      cache.fileChecks[key] = true;
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.Code === 'NotFound' || error.name === 'NoSuchKey') {
        // Lưu kết quả vào cache
        cache.fileChecks[key] = false;
        return false;
      }
      return true;
    }
  } catch (error) {
    console.error(`Lỗi kiểm tra Wasabi: ${key}`);
    return true;
  }
}

// API routes
export async function GET(request) {
  return NextResponse.json({ message: "API is working" });
}

export async function POST(request) {
  // Lưu hàm gốc vào biến ngoài phạm vi try-catch
  const originalUploadToWasabi = uploadToWasabi;

  try {
    console.log("\n=== Bắt đầu import khóa học ===");
    
    // Khởi tạo lại trạng thái đồng bộ và cache
    global.syncState = {
      processedItems: {
        chapters: new Set(),
        lessons: new Set(),
        files: new Set(),
        subfolders: new Set(),
        subsubfolders: new Set()
      },
      needSync: false
    };
    
    // Thiết lập kết nối MongoDB trước khi bắt đầu (tránh kết nối nhiều lần)
    if (!cache.dbConnection) {
      await connectToDatabase();
      cache.dbConnection = true;
    }
    
    // Làm mới cache cho kiểm tra file, nhưng giữ lại kết nối DB
    cache.fileChecks = {};
    cache.courseData = {};
    cache.checkResults = {};
    
    const {
      driveUrl,
      enableSync = false,
      courseId = null,
    } = await request.json();
    
    console.log("URL Drive:", driveUrl);
    console.log("CourseId:", courseId ? courseId : "Tạo mới");

    // Thực thi với enableSync luôn là false
    const actualEnableSync = false;

    // Thêm biến thống kê tốc độ tổng
    const globalStats = {
      totalProcessedFiles: 0,
      totalSize: 0,
      totalDownloadTime: 0,
      totalUploadTime: 0,
      avgDownloadSpeed: 0,
      avgUploadSpeed: 0,
      startTime: Date.now(),
    };

    // Thêm hàm theo dõi hoạt động upload
    const trackFileUpload = (fileStats) => {
      if (fileStats && fileStats.success) {
        globalStats.totalProcessedFiles++;
        globalStats.totalSize += parseFloat(fileStats.fileSize || 0);

        // Tính thời gian tải và upload dựa trên tốc độ và kích thước
        if (parseFloat(fileStats.downloadSpeed) > 0) {
          globalStats.totalDownloadTime +=
            parseFloat(fileStats.fileSize) /
            parseFloat(fileStats.downloadSpeed);
        }

        if (parseFloat(fileStats.uploadSpeed) > 0) {
          globalStats.totalUploadTime +=
            parseFloat(fileStats.fileSize) / parseFloat(fileStats.uploadSpeed);
        }
      }
    };

    // Ghi đè hàm uploadToWasabi để theo dõi tốc độ
    uploadToWasabi = async (...args) => {
      const result = await originalUploadToWasabi(...args);
      trackFileUpload(result);
      return result;
    };

    const folderId = extractDriveId(driveUrl);
    if (!folderId) {
      return NextResponse.json(
        { error: "URL Google Drive không hợp lệ" },
        { status: 400 }
      );
    }
    
    let tokens = await readTokens();
    console.log("Tokens read:", {
      hasTokens: !!tokens,
      hasAccessToken: !!tokens?.access_token,
      tokenType: tokens?.token_type,
      expiryDate: tokens?.expiry_date,
      currentTime: Date.now(),
    });

    if (!tokens) {
      return NextResponse.json(
        {
          success: false,
          error: "Chưa có token. Vui lòng đăng nhập Google Drive trước.",
        },
        { status: 401 }
      );
    }

    if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
      console.log("Token đã hết hạn, đang tự động làm mới...");
      const refreshedTokens = await refreshDriveToken();

      if (!refreshedTokens) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Không thể làm mới token. Vui lòng đăng nhập lại Google Drive.",
          },
          { status: 401 }
        );
      }

      console.log("Đã làm mới token thành công");
      tokens = refreshedTokens;
    }

    if (!tokens.access_token) {
      return NextResponse.json(
        {
          success: false,
          error: "Token không hợp lệ. Vui lòng đăng nhập lại Google Drive.",
        },
        { status: 401 }
      );
    }

    console.log("Đã lấy được access token");

    const drive = await initializeDriveClient();
    console.log("Đã khởi tạo Drive API");

    try {
      const folderInfo = await getFolderInfo(drive, folderId);
      console.log("Thông tin thư mục gốc:", folderInfo);

      if (!folderInfo || !folderInfo.name) {
        return NextResponse.json(
          {
            success: false,
            error:
              "Không thể lấy thông tin thư mục hoặc không có quyền truy cập.",
          },
          { status: 403 }
        );
      }

      // Cập nhật needSync dựa trên tham số enableSync
      global.syncState.needSync = false; // Luôn tắt đồng bộ

      let course;

      if (courseId) {
        // Nếu có courseId, kiểm tra và sử dụng khóa học hiện có
        const courseData = await findOneDocument("courses", { _id: new ObjectId(courseId) });
        if (!courseData) {
          throw new Error(`Không tìm thấy khóa học với ID: ${courseId}`);
        }

        course = { id: courseId, ...courseData, isExisting: true };
        console.log(`Đã tìm thấy khóa học: ${course.id} (${course.title})`);

        // Cập nhật URL Drive nếu chưa có
        await updateDocument(
          "courses",
          { _id: new ObjectId(courseId) },
          {
            $set: {
              driveUrl: driveUrl,
              driveFolderId: folderId,
              updatedAt: new Date()
            }
          }
        );
        console.log(`Đã cập nhật Drive URL cho khóa học: ${driveUrl}`);
      } else {
        // Nếu không có courseId, tạo khóa học mới
        course = await getOrCreateCourse(folderInfo.name, driveUrl, folderId);
        console.log(
          course.isExisting
            ? `Đã tìm thấy khóa học: ${course.id}`
            : `Đã tạo khóa học mới: ${course.id}`
        );

        // Cập nhật Drive URL cho khóa học mới hoặc hiện có
        await updateDocument(
          "courses",
          { _id: new ObjectId(course.id) },
          {
            $set: {
              driveUrl: driveUrl,
              driveFolderId: folderId,
              updatedAt: new Date()
            }
          }
        );
        console.log(`Đã cập nhật Drive URL cho khóa học: ${driveUrl}`);
      }
      
      // Truyền tên khóa học vào lần gọi đầu tiên của processFolder
      await processFolder(
        drive,
        folderId,
        course.id,
        "course",
        null,
        null,
        "",
        course.title
      );
      
      // Thực hiện đồng bộ xóa nếu được yêu cầu
      let syncResult = { hasChanges: false, deletedFilesCount: 0, failedDeletionsCount: 0 };
      // Tắt đồng bộ xóa bất kể giá trị enableSync
      /*
      if (enableSync && course.isExisting) {
        syncResult = await synchronizeDeletedItems(course.id);
      }
      */
      
      const courseData = await findOneDocument("courses", { _id: new ObjectId(course.id) });
      if (!courseData) {
        throw new Error(`Không thể lấy dữ liệu khóa học sau khi import`);
      }
      
      // Tính toán tốc độ trung bình
      const totalTime = (Date.now() - globalStats.startTime) / 1000; // Thời gian tổng cộng (giây)
      
      if (globalStats.totalProcessedFiles > 0) {
        globalStats.avgDownloadSpeed =
          globalStats.totalDownloadTime > 0
            ? (globalStats.totalSize / globalStats.totalDownloadTime).toFixed(2)
            : 0;
        globalStats.avgUploadSpeed =
          globalStats.totalUploadTime > 0
            ? (globalStats.totalSize / globalStats.totalUploadTime).toFixed(2)
            : 0;
      }
      
      return NextResponse.json({
        success: true,
        title: courseData.title || "",
        courseId: course.id,
        syncPerformed: actualEnableSync && course.isExisting,
        syncResult: syncResult,
        message: course.isExisting
          ? `Khóa học đã tồn tại, đã cập nhật nội dung${
              syncResult.hasChanges 
                ? ` và đồng bộ xóa ${syncResult.deletedFilesCount} file (${syncResult.failedDeletionsCount} thất bại)` 
                : ""
            }`
          : "Import khóa học mới thành công",
        stats: {
          totalFiles: globalStats.totalProcessedFiles,
          totalSize: globalStats.totalSize.toFixed(2),
          totalTime: totalTime.toFixed(2),
          avgDownloadSpeed: globalStats.avgDownloadSpeed,
          avgUploadSpeed: globalStats.avgUploadSpeed,
        },
      });
    } catch (error) {
      console.error("Lỗi khi lấy thông tin thư mục:", error);
      return NextResponse.json(
        {
          success: false,
          error: `Lỗi khi lấy thông tin thư mục: ${error.message}`,
        },
        { status: 500 }
      );
    } finally {
      // Đảm bảo khôi phục lại hàm uploadToWasabi gốc trong mọi trường hợp
      uploadToWasabi = originalUploadToWasabi;
    }
  } catch (error) {
    console.error("Lỗi khi import khóa học:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi import khóa học",
      },
      { status: 500 }
    );
  }
}