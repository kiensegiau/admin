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
    
    // Kiểm tra file đã tồn tại trong cache
    if (cache.fileChecks[consistentKey] === true) {
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
      // Cập nhật cache
      cache.fileChecks[consistentKey] = true;
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
    
    // Đặt giá trị cache là false để tránh kiểm tra lại
    cache.fileChecks[consistentKey] = false;
    
    tempDir = path.join(os.tmpdir(), "hocmai-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Chỉ làm sạch tên file để lưu vào bộ nhớ tạm, tránh lỗi hệ thống tệp
    const sanitizedFileName = sanitizeFileName(fileName);
    tempFilePath = path.join(tempDir, sanitizedFileName);

    // Biến theo dõi tốc độ tải
    const downloadStartTime = Date.now();
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

    // Lấy thông tin file để biết kích thước - bỏ qua log không cần thiết
    const fileInfo = await drive.files.get({
      fileId: fileId,
      fields: "size,name",
    });

    totalBytes = parseInt(fileInfo.data.size, 10) || 0;
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    // Đối với file lớn, sử dụng stream để download
    const writer = fs.createWriteStream(tempFilePath);

    // Theo dõi tiến trình tải - giảm số lần log
    fileStream.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;
    });

    try {
      // Thiết lập timeout dài hơn cho các file lớn
      const timeout = Math.max(60000, totalBytes / 1024); // Tối thiểu 60s hoặc 1s cho mỗi KB
      const streamPromise = pipeline(fileStream.data, writer);
      
      // Sử dụng Promise với timeout để tránh treo
      await Promise.race([
        streamPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Download timeout")), timeout)
        )
      ]);
    } catch (err) {
      console.error(`Lỗi khi tải file: ${err.message}`);
      // Đảm bảo đóng writer
      writer.end();
      
      if (retryCount < MAX_RETRIES) {
        // Đợi ngắn hơn trước khi thử lại
        await new Promise(resolve => setTimeout(resolve, 200));
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

    // Đọc file để upload lên Wasabi
    let fileBuffer;
    try {
      fileBuffer = fs.readFileSync(tempFilePath);
    } catch (readErr) {
      console.error(`Lỗi khi đọc file tạm: ${readErr.message}`);
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 200));
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

    // Biến theo dõi tốc độ upload
    const uploadStartTime = Date.now();

    // Upload lên Wasabi với timeout dài hơn cho file lớn
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    try {
      // Đặt timeout dài hơn cho file lớn
      const uploadTimeout = Math.max(60000, fileBuffer.length / 1024);
      
      // Sử dụng Promise.race để tránh treo khi upload
      await Promise.race([
        s3Client.send(command),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Upload timeout")), uploadTimeout)
        )
      ]);
      
      // Cập nhật cache sau khi upload thành công
      cache.fileChecks[key] = true;
    } catch (uploadErr) {
      console.error(`Lỗi khi upload lên Wasabi: ${uploadErr.message}`);
      if (retryCount < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 200));
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

    // Xóa file tạm
    try {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    } catch (unlinkErr) {
      // Không cần retry vì đã upload thành công
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
      // Bỏ qua lỗi xóa file tạm
    }

    // Nếu lỗi ENOENT hoặc lỗi khác liên quan đến file system và chưa vượt quá số lần thử lại
    if (
      (error.code === "ENOENT" || error.message.includes("no such file")) &&
      retryCount < MAX_RETRIES
    ) {
      // Tạm dừng ngắn hơn để giải phóng tài nguyên
      await new Promise((resolve) => setTimeout(resolve, 200));

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
    console.log("Không có file để xử lý");
    return { processed: [], failed: [] };
  }

  // Mảng các tệp đã được xử lý và thất bại
  const processedFiles = [];
  const failedFiles = [];

  console.log(`Bắt đầu xử lý song song ${files.length} file trong ${parentType}`);

  // Lọc các file Google Workspace
  const validFiles = files.filter(file => {
    if (file.mimeType.startsWith("application/vnd.google-apps") && 
        file.mimeType !== "application/vnd.google-apps.folder") {
      console.log(`Bỏ qua Google Workspace file: ${file.name} (${file.mimeType})`);
      return false;
    }
    return true;
  });

  if (validFiles.length === 0) {
    console.log("Không có file hợp lệ để xử lý");
    return { processed: [], failed: [] };
  }

  // Tạo keys cho tất cả file
  const fileKeysMap = {};
  validFiles.forEach(file => {
    fileKeysMap[file.id] = createConsistentKey(file.id, file.name, parentPath);
  });

  // 1. Kiểm tra song song tất cả file trong database
  console.log(`Kiểm tra ${validFiles.length} file trong database...`);
  const dbResults = await Promise.all(
    validFiles.map(file => 
      checkExistingFile(courseId, chapterId, lessonId, file.name, subfolderId, subsubfolderId)
    )
  );

  // Map kết quả truy vấn DB
  const dbExistsMap = {};
  validFiles.forEach((file, index) => {
    dbExistsMap[file.id] = dbResults[index];
  });
  
  // Tăng số lượng kiểm tra song song trên Wasabi
  const CONCURRENT_CHECKS = 10; // Tăng số lượng kiểm tra song song
  
  // Kiểm tra cache trước và chỉ lấy những key chưa có trong cache
  const keysToCheck = new Set();
  const keysFromCache = new Set();
  
  validFiles.forEach(file => {
    // Kiểm tra DB key trong cache
    if (dbExistsMap[file.id]?.storage?.provider === 'wasabi') {
      const dbKey = dbExistsMap[file.id].storage.key;
      if (cache.fileChecks[dbKey] !== undefined) {
        keysFromCache.add(dbKey);
      } else {
        keysToCheck.add(dbKey);
      }
    }
    
    // Kiểm tra key mới trong cache
    const newKey = fileKeysMap[file.id];
    if (cache.fileChecks[newKey] !== undefined) {
      keysFromCache.add(newKey);
    } else {
      keysToCheck.add(newKey);
    }
  });
  
  console.log(`Lấy ${keysFromCache.size} key từ cache, cần kiểm tra ${keysToCheck.size} key trên Wasabi`);
  
  // Kiểm tra Wasabi theo lô
  const wasabiExistsMap = {};
  
  // Thêm kết quả từ cache
  keysFromCache.forEach(key => {
    wasabiExistsMap[key] = cache.fileChecks[key];
  });
  
  // Chuyển sang array để xử lý theo lô
  const keysArray = [...keysToCheck];
  
  // Xử lý theo lô
  for (let i = 0; i < keysArray.length; i += CONCURRENT_CHECKS) {
    const batch = keysArray.slice(i, i + CONCURRENT_CHECKS);
    const batchResults = await Promise.all(
      batch.map(async key => {
        const exists = await checkWasabiFile(key);
        // Lưu kết quả vào cache
        cache.fileChecks[key] = exists;
        return { key, exists };
      })
    );
    
    // Thêm kết quả lô vào map
    batchResults.forEach(result => {
      wasabiExistsMap[result.key] = result.exists;
    });
  }
  
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
  
  // 4. Upload song song các file cần tải lên (tăng số lượng cùng lúc)
  const CONCURRENT_UPLOADS = 5; // Tăng số lượng upload song song
  const uploadResults = [];
  
  if (filesToUpload.length > 0) {
    console.log(`Upload song song ${filesToUpload.length} file (${CONCURRENT_UPLOADS} file cùng lúc)...`);
    
    for (let i = 0; i < filesToUpload.length; i += CONCURRENT_UPLOADS) {
      const batch = filesToUpload.slice(i, i + CONCURRENT_UPLOADS);
      
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
  try {
    // Tạo cache key để kiểm tra trùng lặp
    const cacheKey = `file_${fileData.id}_${lessonId}_${subfolderId || ''}_${subsubfolderId || ''}`;
    
    // Kiểm tra file đã được xử lý chưa
    if (cache.fileChecks[cacheKey]) {
      return { success: true, file: fileData, cachedResult: true };
    }
    
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
    } else if (subfolderId || parentType === "subfolder") {
      // Thêm vào subfolder
      if (!subfolderId) {
        // Sử dụng cache để tìm hoặc tạo subfolder
        const cacheSubfolderKey = `subfolder_${lessonId}_${parentPath}`;
        
        if (cache.fileChecks[cacheSubfolderKey]) {
          subfolderId = cache.fileChecks[cacheSubfolderKey];
        } else {
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
            
            // Lưu vào cache
            cache.fileChecks[cacheSubfolderKey] = subfolderId;
            global.syncState.processedItems.subfolders.add(subfolderId);
          }
        }
      }
      
      result = await addFileToLesson(
        courseId,
        chapterId,
        lessonId,
        fileData,
        subfolderId
      );
    } else {
      // Thêm vào lesson
      result = await addFileToLesson(
        courseId,
        chapterId,
        lessonId,
        fileData
      );
    }
    
    // Lưu kết quả vào cache để tránh xử lý trùng lặp
    cache.fileChecks[cacheKey] = true;
    
    return result;
  } catch (error) {
    console.error(`Lỗi khi thêm file ${fileData.name} vào database:`, error);
    return { success: false, error: error.message };
  }
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
      // Kiểm tra cache trước
      if (cache.courseData[courseId]) {
        courseName = cache.courseData[courseId].title || "Unknown Course";
      } else {
        const courseData = await findOneDocument("courses", { _id: new ObjectId(courseId) });
        if (courseData) {
          courseName = courseData.title || "Unknown Course";
          // Lưu vào cache
          cache.courseData[courseId] = courseData;
        } else {
          courseName = "Unknown Course";
        }
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

    // Giảm log không cần thiết
    if (parentType === "course") {
      console.log(`\n=== Xử lý thư mục gốc khóa học: ${courseName} ===`);
    }
    
    // Lấy nội dung thư mục với một lần gọi
    const files = await listFolderContents(drive, folderId);
    const folders = files.filter(f => f.mimeType === "application/vnd.google-apps.folder");
    const documents = files.filter(f => f.mimeType !== "application/vnd.google-apps.folder");

    console.log(`Tìm thấy ${folders.length} thư mục con và ${documents.length} file`);

    // Xử lý song song các thư mục con khi ở cấp cao nhất
    if (parentType === "course" || parentType === "chapter") {
      const folderPromises = folders.map(async (folder) => {
        const folderName = folder.name;
        const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        
        if (parentType === "course") {
          // Course -> Chapter
          const chapter = await getOrCreateChapter(courseId, folderName);
          global.syncState.processedItems.chapters.add(chapter.id);
          
          console.log(`Xử lý chapter: ${folderName}`);
          
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
        } 
        else if (parentType === "chapter") {
          // Chapter -> Lesson
          const lesson = await getOrCreateLesson(courseId, parentId, folderName);
          global.syncState.processedItems.lessons.add(lesson.id);
          
          console.log(`Xử lý lesson: ${folderName}`);
          
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
        }
      });
      
      // Xử lý song song
      await Promise.all(folderPromises);
    } 
    else {
      // Xử lý tuần tự cho các cấp sâu hơn để tránh quá tải
      for (const folder of folders) {
        const folderName = folder.name;
        const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
        
        if (parentType === "lesson" && lessonId) {
          // Lesson -> Subfolder
          const newSubfolderId = await getOrCreateSubfolder(
            courseId,
            parentId,
            lessonId,
            folderName
          );
          global.syncState.processedItems.subfolders.add(newSubfolderId);
          
          console.log(`Xử lý subfolder: ${folderName}`);

          await processFolder(
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
        } 
        else if (parentType === "subfolder" && lessonId && subfolderId) {
          // Subfolder -> Subsubfolder
          const subsubfolderId = await getOrCreateSubsubfolder(
            courseId,
            parentId,
            lessonId,
            subfolderId,
            folderName
          );
          global.syncState.processedItems.subsubfolders.add(subsubfolderId);
          
          console.log(`Xử lý subsubfolder: ${folderName}`);
          
          // Lấy và xử lý các file trong subsubfolder với một lần gọi
          const subsubfolderFiles = await listFolderContents(drive, folder.id);
          const subsubfolderDocuments = subsubfolderFiles.filter(
            f => f.mimeType !== "application/vnd.google-apps.folder"
          );
          
          // Lọc các file hợp lệ
          const validFiles = subsubfolderDocuments.filter(file => {
            const type = getFileType(file.mimeType);
            return type !== "other";
          });
          
          if (validFiles.length > 0) {
            console.log(`Xử lý ${validFiles.length} file trong subsubfolder "${folderName}"`);
            
            // Đánh dấu các file đã xử lý vào syncState
            validFiles.forEach(file => {
              global.syncState.processedItems.files.add(file.id);
            });
            
            // Xử lý các file trong subsubfolder
            await processFiles(
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
          
          // Kiểm tra xem có thư mục con trong subsubfolder không
          const subsubfolderFolders = subsubfolderFiles.filter(
            f => f.mimeType === "application/vnd.google-apps.folder"
          );
          
          if (subsubfolderFolders.length > 0) {
            console.log(`Cảnh báo: Tìm thấy ${subsubfolderFolders.length} thư mục trong subsubfolder "${folderName}" - không được hỗ trợ`);
          }
        }
      }
    }

    // Xử lý các file trong thư mục hiện tại
    if ((parentType === "lesson" || parentType === "subfolder") && lessonId) {
      const validFiles = documents.filter(file => {
        const type = getFileType(file.mimeType);
        return type !== "other";
      });

      if (validFiles.length > 0) {
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
      }
    }

    if (parentType === "course") {
      console.log(`=== Hoàn thành xử lý khóa học: ${courseName} ===\n`);
    }
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
    // Cập nhật cache sau khi xóa
    cache.fileChecks[key] = false;
    return true;
  } catch (error) {
    console.error(`Lỗi khi xóa file từ Wasabi (${key}):`, error);
    
    // Giảm thời gian chờ khi retry
    if (retryCount < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, 200));
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

// Kiểm tra file tồn tại trên Wasabi - cải thiện hiệu suất
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
      // Cập nhật cache
      cache.fileChecks[key] = true;
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.Code === 'NotFound' || error.name === 'NoSuchKey') {
        // Cập nhật cache
        cache.fileChecks[key] = false;
        return false;
      }
      // Trường hợp lỗi khác, lưu vào cache để tránh kiểm tra lại
      cache.fileChecks[key] = true;
      return true;
    }
  } catch (error) {
    // Để an toàn, không lưu vào cache khi có lỗi không xác định
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
    
    // Khởi tạo lại trạng thái đồng bộ ngay từ đầu để tránh lỗi
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
    console.log("Đã khởi tạo lại trạng thái đồng bộ");
    
    const {
      driveUrl,
      enableSync = false, // Luôn đặt giá trị mặc định là false
      courseId = null,
    } = await request.json();
    console.log("URL Drive:", driveUrl);
    console.log("Đồng bộ xóa: TẠM THỜI BỊ TẮT");
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

    // Làm mới cache trước khi bắt đầu import
    cache.fileChecks = {};
    cache.courseData = {};

    const folderId = extractDriveId(driveUrl);
    console.log("Folder ID:", folderId);

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