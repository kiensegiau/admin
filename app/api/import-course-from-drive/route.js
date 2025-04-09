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

// Hàm tiện ích để đo và log thời gian thực thi cho Wasabi
const logWasabiExecutionTime = async (operation, wasabiOperation) => {
  const startTime = Date.now();
  try {
    const result = await wasabiOperation();
    const responseTime = Date.now() - startTime;
    console.log(`[WASABI] ${operation} hoàn thành trong ${responseTime}ms`);
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[WASABI ERROR] ${operation} thất bại sau ${responseTime}ms:`, error.message);
    throw error;
  }
};

// Hàm tiện ích để đo và log thời gian thực thi cho Google Drive
const logDriveExecutionTime = async (operation, driveOperation) => {
  const startTime = Date.now();
  try {
    const result = await driveOperation();
    const responseTime = Date.now() - startTime;
    console.log(`[DRIVE] ${operation} hoàn thành trong ${responseTime}ms`);
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[DRIVE ERROR] ${operation} thất bại sau ${responseTime}ms:`, error.message);
    throw error;
  }
};

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
    
    // Kiểm tra file đã tồn tại trên Wasabi chưa
    const fileExistsOnWasabi = await checkWasabiFile(consistentKey);
    if (fileExistsOnWasabi) {
      console.log(`File đã tồn tại trên Wasabi với key ${consistentKey}, bỏ qua upload`);
      // Trả về thông tin file đã tồn tại
      return {
        success: true,
        key: consistentKey,
        size: 0, // Không biết kích thước chính xác
        downloadSpeed: 0,
        uploadSpeed: 0,
        fileSize: "0", // Không biết kích thước chính xác
        wasReused: true // Đánh dấu file được tái sử dụng
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
    const fileStream = await logDriveExecutionTime(`getFileStream fileId=${fileId}`, async () => {
      return drive.files.get(
        {
          fileId: fileId,
          alt: "media",
        },
        { responseType: "stream" }
      );
    });

    // Lấy thông tin file để biết kích thước
    const fileInfo = await logDriveExecutionTime(`getFileInfo fileId=${fileId}`, async () => {
      return drive.files.get({
        fileId: fileId,
        fields: "size,name",
      });
    });

    totalBytes = parseInt(fileInfo.data.size, 10) || 0;
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);

    // Đối với file lớn, sử dụng stream để download
    const writer = fs.createWriteStream(tempFilePath);

    // Theo dõi tiến trình tải
    fileStream.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;
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
      
    console.log(`Tải xuống ${fileName}: ${fileSizeInMB.toFixed(2)} MB trong ${downloadDuration.toFixed(2)}s (${downloadSpeed} MB/s)`);

    // Sử dụng key cố định thay vì tạo mới
    const key = consistentKey;

    // Biến theo dõi tốc độ upload
    const uploadStartTime = Date.now();
    
    // SỬA ĐỔI: Sử dụng stream để upload thay vì đọc toàn bộ file vào bộ nhớ
    try {
      // Tạo stream để đọc file
      const fileStream = fs.createReadStream(tempFilePath);
      
      // Upload lên Wasabi sử dụng stream để tiết kiệm bộ nhớ
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileStream,
        ContentType: mimeType,
        ContentLength: fileSizeInBytes,  // Cung cấp kích thước file để S3 tối ưu
      });
      
      await logWasabiExecutionTime(`uploadFile key=${key}`, async () => {
        await s3Client.send(command);
      });

      // Xác minh file đã được tải lên thành công
      try {
        await logWasabiExecutionTime(`verifyUpload key=${key}`, async () => {
          const checkCommand = new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
          });
          await s3Client.send(checkCommand);
        });
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
      
    console.log(`Upload lên Wasabi ${fileName}: ${fileSizeInMB.toFixed(2)} MB trong ${uploadDuration.toFixed(2)}s (${uploadSpeed} MB/s)`);

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
      size: fileSizeInBytes,
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
    
    return await logDriveExecutionTime(`downloadFile fileId=${fileId}`, async () => {
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
    });
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

  // 1. Kiểm tra song song tất cả file trong database
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
  const wasabiResults = await Promise.all(
    [...keysToCheck].map(async key => {
      // Kiểm tra cache trước
      if (cache.fileChecks[key] !== undefined) {
        return { key, exists: cache.fileChecks[key] };
      }
      
      // Không có trong cache, kiểm tra trên Wasabi
      const exists = await checkWasabiFile(key);
      // Lưu kết quả vào cache
      cache.fileChecks[key] = exists;
      return { key, exists };
    })
  );
  
  // Map kết quả kiểm tra Wasabi
  const wasabiExistsMap = {};
  wasabiResults.forEach(result => {
    wasabiExistsMap[result.key] = result.exists;
  });
  
  // Kiểm tra thêm key mới cho những file có key cũ không tồn tại
  const additionalKeysToCheck = new Set();
  
  validFiles.forEach(file => {
    const dbFile = dbExistsMap[file.id];
    // Nếu file có trong DB và có key Wasabi, nhưng key đó không tồn tại trên Wasabi
    if (dbFile?.storage?.provider === 'wasabi' && 
        !wasabiExistsMap[dbFile.storage.key] && 
        !keysToCheck.has(fileKeysMap[file.id])) {
      // Kiểm tra key mới
      additionalKeysToCheck.add(fileKeysMap[file.id]);
    }
  });
  
  // Kiểm tra các key bổ sung nếu cần
  if (additionalKeysToCheck.size > 0) {
    const additionalResults = await Promise.all(
      [...additionalKeysToCheck].map(async key => {
        // Kiểm tra cache trước
        if (cache.fileChecks[key] !== undefined) {
          return { key, exists: cache.fileChecks[key] };
        }
        
        // Không có trong cache, kiểm tra trên Wasabi
        const exists = await checkWasabiFile(key);
        // Lưu kết quả vào cache
        cache.fileChecks[key] = exists;
        return { key, exists };
      })
    );
    
    // Bổ sung kết quả vào map
    additionalResults.forEach(result => {
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
  
  // 4. Upload song song các file cần tải lên (giới hạn số lượng cùng lúc)
  const CONCURRENT_UPLOADS = 3; // Số file upload cùng lúc
  const uploadResults = [];
  
  if (filesToUpload.length > 0) {
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
  } else {
    // Thêm vào lesson
    result = await addFileToLesson(
      courseId,
      chapterId,
      lessonId,
      fileData
    );
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

    const files = await logDriveExecutionTime(
      `listFolderContents folderId=${folderId}`, 
      () => listFolderContents(drive, folderId)
    );
    
    const folders = files.filter(
      (f) => f.mimeType === "application/vnd.google-apps.folder"
    );
    const documents = files.filter(
      (f) => f.mimeType !== "application/vnd.google-apps.folder"
    );

    // Xử lý các thư mục con - đồng nhất cách xử lý cho tất cả các cấp
    for (const folder of folders) {
      const folderName = folder.name;
      const newPath = currentPath ? `${currentPath}/${folderName}` : folderName;
      
      // Xử lý theo từng loại parentType
      if (parentType === "course") {
        // Course -> Chapter
        const chapter = await getOrCreateChapter(courseId, folderName);
        global.syncState.processedItems.chapters.add(chapter.id);
        
        await processFolder(
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
        
        await processFolder(
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
      else if (parentType === "lesson" && lessonId) {
        // Lesson -> Subfolder
        const newSubfolderId = await getOrCreateSubfolder(
          courseId,
          parentId,
          lessonId,
          folderName
        );
        global.syncState.processedItems.subfolders.add(newSubfolderId);
        
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
          await processFiles(
            drive,
            validFiles,
            courseId,
            parentId,
            lessonId,
            "subsubfolder", // Đảm bảo parentType là "subsubfolder"
            newPath,
            subfolderId,
            subsubfolderId
          );
        }
      }
    }

    // Xử lý các file trong thư mục hiện tại (không đổi logic này)
    if ((parentType === "lesson" || parentType === "subfolder") && lessonId) {
      const validFiles = documents.filter(file => {
        const type = getFileType(file.mimeType);
        return type !== "other";
      });

      if (validFiles.length > 0) {
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

    return await logWasabiExecutionTime(`deleteFile key=${key.substring(0, 30)}...`, async () => {
      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });

      await s3Client.send(command);
      console.log(`Đã xóa file từ Wasabi thành công: ${key}`);
      return true;
    }).catch(async (error) => {
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
        const exists = await checkWasabiFile(key);
        return !exists;
      } catch (checkError) {
        console.error(`Lỗi khi kiểm tra file sau khi xóa thất bại: ${checkError.message}`);
        return false;
      }
    });
  } catch (error) {
    console.error(`Lỗi khi xóa file từ Wasabi (${key}):`, error);
    return false;
  }
}

// Kiểm tra file tồn tại trên Wasabi
async function checkWasabiFile(key) {
  if (!key) {
    console.warn("Không có key file để kiểm tra trên Wasabi");
    return false;
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return await logWasabiExecutionTime(`checkFile key=${key.substring(0, 30)}...`, async () => {
      try {
        await s3Client.send(command);
        return true;
      } catch (error) {
        if (error.name === 'NotFound' || error.Code === 'NotFound' || error.name === 'NoSuchKey') {
          return false;
        }
        // Nếu lỗi khác không phải NotFound, coi như file có thể tồn tại
        console.warn(`Lỗi khi kiểm tra file trên Wasabi: ${error.message}`);
        return true;
      }
    });
  } catch (error) {
    console.error(`Lỗi khi kiểm tra file tồn tại trên Wasabi (${key}):`, error);
    // Trong trường hợp lỗi, trả về true để tránh tải lại file không cần thiết
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
    
    const {
      driveUrl,
      enableSync = false, // Luôn đặt giá trị mặc định là false
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

    const drive = await initializeDriveClient();

    try {
      const folderInfo = await logDriveExecutionTime(
        `getFolderInfo folderId=${folderId}`, 
        () => getFolderInfo(drive, folderId)
      );

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
      } else {
        // Nếu không có courseId, tạo khóa học mới
        course = await getOrCreateCourse(folderInfo.name, driveUrl, folderId);

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
          
        console.log(`===== Thống kê tổng =====`);
        console.log(`- Số file xử lý: ${globalStats.totalProcessedFiles}`);
        console.log(`- Tổng dung lượng: ${globalStats.totalSize.toFixed(2)} MB`);
        console.log(`- Tốc độ tải trung bình: ${globalStats.avgDownloadSpeed} MB/s`);
        console.log(`- Tốc độ upload trung bình: ${globalStats.avgUploadSpeed} MB/s`);
        console.log(`- Thời gian thực hiện: ${totalTime.toFixed(2)}s`);
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