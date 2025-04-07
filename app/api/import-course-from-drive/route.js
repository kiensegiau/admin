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
  ObjectId
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
  addFileToLesson,
  synchronizeDeletedItems,
  getFileType,
  getOrCreateSubsubfolder,
} from './adapter-impl';

import { connectMongoDB } from '@/lib/mongodb';

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

    // Theo dõi tiến trình tải
    fileStream.data.on("data", (chunk) => {
      downloadedBytes += chunk.length;

      // Hiển thị tiến trình mỗi 1 giây hoặc khi tải xong
      const now = Date.now();
      if (now - lastProgressTime > 1000 || downloadedBytes >= totalBytes) {
        const percent = totalBytes
          ? Math.round((downloadedBytes / totalBytes) * 100)
          : 0;
        const downloadedMB = (downloadedBytes / (1024 * 1024)).toFixed(2);
        const elapsedSecs = ((now - downloadStartTime) / 1000).toFixed(1);
        const currentSpeed = (downloadedMB / elapsedSecs).toFixed(2);

        console.log(
          `Tải xuống: ${percent}% (${downloadedMB}/${totalMB} MB) - Tốc độ hiện tại: ${currentSpeed} MB/s`
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

    // Tạo key cho file trên Wasabi dựa vào cấu trúc thư mục từ Google Drive
    const timestamp = Date.now();
    const uniqueId = uuidv4().substring(0, 8); // Lấy 8 ký tự đầu của UUID

    // Tạo key với tên file đã được xử lý
    let key;

    // Xử lý đường dẫn thư mục nếu có, giữ cấu trúc nhưng xử lý các ký tự đặc biệt
    if (folderPath && folderPath !== "") {
      // Xử lý đường dẫn an toàn
      const sanitizedPath = sanitizeWasabiPath(folderPath);
      // Tạo key cho file
      key = `courses/${sanitizedPath}/${timestamp}-${uniqueId}-${sanitizeFileName(
        fileName
      )}`;
    } else {
      key = `courses/${timestamp}-${uniqueId}-${sanitizeFileName(fileName)}`;
    }

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
 * Xử lý các file trong folder
 * @param {Object} drive - Drive service
 * @param {Array} files - Danh sách file
 * @param {string} courseId - ID khóa học
 * @param {string} chapterId - ID chapter
 * @param {string} lessonId - ID lesson
 * @param {string} parentType - Loại parent (lesson/subfolder)
 * @param {string} parentPath - Đường dẫn parent
 * @param {string} subfolderId - ID của subfolder (nếu có)
 * @param {string} subsubfolderId - ID của subsubfolder (nếu có)
 * @returns {Promise<void>}
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
    return;
  }

  // Mảng các tệp đã được xử lý
  const processedFiles = [];
  const failedFiles = [];

  console.log(`Xử lý ${files.length} file trong ${parentType}`);

  let index = 0;
  for (const file of files) {
    index++;
    try {
      // Kiểm tra nếu file đã được xử lý ở các lần trước
      if (global.syncState.processedItems.files.has(file.id)) {
        console.log(`File ${file.name} đã được xử lý trước đó, bỏ qua.`);
        processedFiles.push(file);
        continue;
      }

      // Kiểm tra loại file
      if (file.mimeType.startsWith("application/vnd.google-apps")) {
        if (file.mimeType !== "application/vnd.google-apps.folder") {
          console.log(`Bỏ qua Google Workspace file: ${file.name} (${file.mimeType})`);
        }
        continue;
      }

      // Tên thư mục cha hiện tại
      const relativePath = parentPath || "";

      // Đường dẫn file trên Wasabi, bổ sung thông tin subsubfolder nếu có
      let wasabiPath;

      if (subsubfolderId && subfolderId) {
        // Nếu là file trong subsubfolder
        // Lấy tên của subfolder và subsubfolder
        let subfolderName = "";
        let subsubfolderName = "";
        
        try {
          // Kết nối MongoDB để lấy tên
          await connectMongoDB();
          const courseContent = await findOneDocument("courseContents", { 
            courseId: new ObjectId(courseId)
          });
          
          if (courseContent) {
            // Tìm subfolder và subsubfolder để lấy tên
            const chapter = courseContent.chapters.find(c => c.id === chapterId);
            if (chapter) {
              const lesson = chapter.lessons.find(l => l.id === lessonId);
              if (lesson) {
                const subfolder = lesson.subfolders.find(sf => sf.id === subfolderId);
                if (subfolder) {
                  subfolderName = subfolder.name;
                  const subsubfolder = subfolder.subfolders?.find(ssf => ssf.id === subsubfolderId);
                  if (subsubfolder) {
                    subsubfolderName = subsubfolder.name;
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error(`Lỗi khi lấy tên subfolder/subsubfolder: ${error.message}`);
        }
        
        // Nếu không lấy được tên, sử dụng ID
        if (!subfolderName) subfolderName = subfolderId;
        if (!subsubfolderName) subsubfolderName = subsubfolderId;
        
        wasabiPath = `courses/${courseId}/${relativePath}${relativePath ? "/" : ""}${subfolderName}/${subsubfolderName}/${file.name}`;
      } else if (subfolderId) {
        // Nếu là file trong subfolder
        // Lấy tên của subfolder
        let subfolderName = "";
        
        try {
          // Kết nối MongoDB để lấy tên
          await connectMongoDB();
          const courseContent = await findOneDocument("courseContents", { 
            courseId: new ObjectId(courseId)
          });
          
          if (courseContent) {
            // Tìm subfolder để lấy tên
            const chapter = courseContent.chapters.find(c => c.id === chapterId);
            if (chapter) {
              const lesson = chapter.lessons.find(l => l.id === lessonId);
              if (lesson) {
                const subfolder = lesson.subfolders.find(sf => sf.id === subfolderId);
                if (subfolder) {
                  subfolderName = subfolder.name;
                }
              }
            }
          }
        } catch (error) {
          console.error(`Lỗi khi lấy tên subfolder: ${error.message}`);
        }
        
        // Nếu không lấy được tên, sử dụng ID
        if (!subfolderName) subfolderName = subfolderId;
        
        wasabiPath = `courses/${courseId}/${relativePath}${relativePath ? "/" : ""}${subfolderName}/${file.name}`;
      } else {
        // Nếu là file trong lesson
        wasabiPath = `courses/${courseId}/${relativePath}${relativePath ? "/" : ""}${file.name}`;
      }

      console.log(`[${index}/${files.length}] Đang xử lý file "${file.name}"...`);

      // Download file từ Google Drive
      const downloadResult = await downloadFileFromDrive(drive, file.id);
      if (!downloadResult.success) {
        console.error(
          `Không thể tải file ${file.name} từ Google Drive: ${downloadResult.error}`
        );
        failedFiles.push({ ...file, error: downloadResult.error });
        continue;
      }

      // Upload file lên Wasabi
      const uploadResult = await uploadToWasabi(
        downloadResult.data,
        wasabiPath,
        file.mimeType
      );

      if (!uploadResult.success) {
        console.error(
          `Không thể tải file ${file.name} lên Wasabi: ${uploadResult.error}`
        );
        failedFiles.push({ ...file, error: uploadResult.error });
        continue;
      }

      // Thêm thông tin file vào database
      try {
        const fileData = {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          type: getFileType(file.mimeType),
          modifiedTime: file.modifiedTime,
          size: file.size,
          storage: {
            provider: "wasabi",
            key: wasabiPath,
            size: parseInt(file.size),
            uploadTime: new Date().toISOString(),
          },
        };

        // Thêm vào database tùy theo loại parent
        let result;
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
          console.log(`Đã thêm file ${file.name} vào subsubfolder trong database.`);
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
          console.log(`Đã thêm file ${file.name} vào subfolder trong database.`);
        } else {
          // Thêm vào lesson
          result = await addFileToLesson(
            courseId,
            chapterId,
            lessonId,
            fileData
          );
          console.log(`Đã thêm file ${file.name} vào lesson trong database.`);
        }

        // Đánh dấu file đã được xử lý
        global.syncState.processedItems.files.add(file.id);
        processedFiles.push(file);
        
        // Đánh dấu cần đồng bộ hóa (để xóa các mục không còn tồn tại)
        global.syncState.needSync = true;
      } catch (error) {
        console.error(`Lỗi khi thêm file ${file.name} vào database: ${error.message}`);
        failedFiles.push({ ...file, error: error.message });
      }
    } catch (error) {
      console.error(`Lỗi khi xử lý file ${file.name}: ${error.message}`);
      failedFiles.push({ ...file, error: error.message });
    }
  }

  console.log(
    `Kết quả xử lý files: ${processedFiles.length} thành công, ${failedFiles.length} thất bại.`
  );

  return {
    processed: processedFiles,
    failed: failedFiles
  };
}

async function processFolder(
  drive,
  folderId,
  courseId,
  parentType = "course",
  parentId = null,
  lessonId = null,
  parentPath = "",
  courseName = null
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

    console.log(`\n=== Bắt đầu xử lý thư mục ${currentPath || "gốc"} ===`);
    console.log(`ParentType: ${parentType}, CourseId: ${courseId}`);

    const files = await listFolderContents(drive, folderId);
    const folders = files.filter(
      (f) => f.mimeType === "application/vnd.google-apps.folder"
    );
    const documents = files.filter(
      (f) => f.mimeType !== "application/vnd.google-apps.folder"
    );

    // Xử lý các thư mục con
    for (const folder of folders) {
      const newPath = currentPath
        ? `${currentPath}/${folder.name}`
        : folder.name;
      console.log(`Tạo đường dẫn mới: ${newPath}`);

      // Hiển thị đường dẫn đã xử lý để kiểm tra
      const sanitizedPath = sanitizeWasabiPath(newPath);
      console.log(`Đường dẫn sau khi xử lý: ${sanitizedPath}`);

      if (parentType === "course") {
        // Kiểm tra và tạo/tái sử dụng chương
        const chapter = await getOrCreateChapter(courseId, folder.name);
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
      } else if (parentType === "chapter") {
        // Kiểm tra và tạo/tái sử dụng bài học
        const lesson = await getOrCreateLesson(
          courseId,
          parentId,
          folder.name
        );
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
      } else if ((parentType === "lesson" || parentType === "subfolder") && lessonId) {
        // Thêm kiểm tra lessonId có tồn tại không
        // Kiểm tra và tạo/tái sử dụng thư mục con
        const subfolderName = folder.name;
        const subfolderId = await getOrCreateSubfolder(
          courseId,
          parentId,
          lessonId,
          subfolderName
        );
        global.syncState.processedItems.subfolders.add(subfolderId);

        await processFolder(
          drive,
          folder.id,
          courseId,
          "subfolder",
          parentId,
          lessonId,
          newPath,
          courseName
        );
      }
    }

    // Xử lý các file
    if ((parentType === "lesson" || parentType === "subfolder") && lessonId) {
      const validFiles = documents.filter((file) => {
        const type = getFileType(file.mimeType);
        return type !== "other";
      });

      if (validFiles.length > 0) {
        console.log(
          `Xử lý ${validFiles.length} file trong thư mục "${currentPath}"`
        );
        
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
          currentPath
        );
      }
    }

    // Thêm mới: Tìm các thư mục con trong subfolder hiện tại (để làm subsubfolders)
    const subsubfolders = files.filter(
      (f) => f.mimeType === "application/vnd.google-apps.folder" && f.parents && f.parents.includes(folderId)
    );
    
    if (subsubfolders.length > 0) {
      console.log(`Tìm thấy ${subsubfolders.length} subsubfolders trong subfolder ${folder.name}`);
      
      // Xử lý từng subsubfolder
      for (const subsubfolder of subsubfolders) {
        try {
          // Tạo hoặc lấy subsubfolder
          const subsubfolderId = await getOrCreateSubsubfolder(
            courseId,
            parentId,
            lessonId,
            subfolderId,
            subsubfolder.name
          );
          
          // Đánh dấu đã xử lý
          global.syncState.processedItems.subsubfolders.add(subsubfolderId);
          
          console.log(`Đã tạo/lấy subsubfolder: ${subsubfolder.name} (ID: ${subsubfolderId})`);
          
          // Lấy danh sách file trong subsubfolder
          const subsubfolderFiles = documents.filter(
            (f) => f.parents && f.parents.includes(subsubfolder.id)
          );
          
          // Xử lý các file trong subsubfolder
          await processFiles(
            drive,
            subsubfolderFiles,
            courseId,
            parentId,
            lessonId,
            "subfolder",
            currentPath,
            subfolderId,
            subsubfolderId
          );
          
          console.log(`Đã xử lý ${subsubfolderFiles.length} file trong subsubfolder ${subsubfolder.name}`);
        } catch (error) {
          console.error(`Lỗi khi xử lý subsubfolder ${subsubfolder.name}:`, error);
        }
      }
    }

    console.log(`=== Kết thúc xử lý thư mục ${currentPath || "gốc"} ===\n`);
  } catch (error) {
    console.error(`Lỗi khi xử lý thư mục ${parentPath || "gốc"}:`, error);
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
    console.warn("Không có key file để kiểm tra trên Wasabi");
    return false;
  }

  try {
    console.log(`Kiểm tra file tồn tại trên Wasabi với key: ${key}`);

    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    try {
      await s3Client.send(command);
      console.log(`File tồn tại trên Wasabi: ${key}`);
      return true;
    } catch (error) {
      if (error.name === 'NotFound' || error.Code === 'NotFound' || error.name === 'NoSuchKey') {
        console.warn(`File không tồn tại trên Wasabi: ${key}`);
        return false;
      }
      // Nếu lỗi khác không phải NotFound, coi như file có thể tồn tại
      console.warn(`Lỗi khi kiểm tra file trên Wasabi: ${error.message}`);
      return true;
    }
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
    const {
      driveUrl,
      enableSync = true,
      courseId = null,
    } = await request.json();
    console.log("URL Drive:", driveUrl);
    console.log("Đồng bộ xóa:", enableSync ? "Bật" : "Tắt");
    console.log("CourseId:", courseId ? courseId : "Tạo mới");

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

      // Khởi tạo lại trạng thái đồng bộ
      global.syncState.processedItems.chapters.clear();
      global.syncState.processedItems.lessons.clear();
      global.syncState.processedItems.files.clear();
      global.syncState.processedItems.subfolders.clear();
      global.syncState.processedItems.subsubfolders.clear();
      global.syncState.needSync = enableSync;

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

      return NextResponse.json({
        success: true,
        message: "Khóa học đã được import thành công",
        stats: globalStats,
      });
    } catch (error) {
      console.error("Lỗi khi import khóa học:", error);
      return NextResponse.json(
        {
          success: false,
          error: "Đã xảy ra lỗi khi import khóa học. Vui lòng thử lại sau.",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Lỗi khi import khóa học:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Đã xảy ra lỗi khi import khóa học. Vui lòng thử lại sau.",
      },
      { status: 500 }
    );
  }
}