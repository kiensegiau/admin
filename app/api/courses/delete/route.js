export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { ObjectId, findOneDocument, deleteDocument } from "@/lib/db";
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

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

// Hàm xóa file từ Wasabi
async function deleteFromWasabi(key) {
  if (!key) {
    console.warn("Không có key file để xóa từ Wasabi");
    return false;
  }

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
    return false;
  }
}

// Kiểm tra xem key có tồn tại trên Wasabi không
async function checkWasabiKeyExists(key) {
  if (!key) return false;

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    // Nếu không có lỗi, key tồn tại
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.log(`Key không tồn tại hoặc có lỗi: ${key}`);
    return false;
  }
}

// Tìm tất cả file trong thư mục Wasabi có chứa courseId
async function findWasabiFilesByPrefix(courseId) {
  if (!courseId) return [];

  try {
    console.log(`Tìm kiếm các file trên Wasabi có liên quan đến khóa học: ${courseId}`);
    
    // Các tiền tố có thể có cho khóa học này
    const prefixes = [
      `courses/${courseId}/`,
      `course/${courseId}/`,
      `${courseId}/`
    ];
    
    let allKeys = [];
    
    // Tìm kiếm theo từng tiền tố
    for (const prefix of prefixes) {
      try {
        const command = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
          MaxKeys: 1000
        });
        
        const response = await s3Client.send(command);
        
        if (response.Contents && response.Contents.length > 0) {
          console.log(`Tìm thấy ${response.Contents.length} files với tiền tố "${prefix}"`);
          
          const keys = response.Contents.map(item => ({
            key: item.Key,
            size: item.Size,
            lastModified: item.LastModified
          }));
          
          allKeys = [...allKeys, ...keys];
        }
      } catch (error) {
        console.error(`Lỗi khi liệt kê files với tiền tố "${prefix}":`, error);
      }
    }
    
    console.log(`Tổng số file tìm thấy trên Wasabi: ${allKeys.length}`);
    return allKeys;
  } catch (error) {
    console.error('Lỗi khi tìm kiếm files trên Wasabi:', error);
    return [];
  }
}

// Xóa nhiều file song song theo batch
async function deleteFilesInBatches(files) {
  const BATCH_SIZE = 10; // Số file xử lý song song mỗi lần
  let deletedCount = 0;
  let failedFiles = [];

  // Lọc và chuẩn hóa danh sách file
  const filesToDelete = [];
  
  // Xử lý mỗi file và trích xuất key Wasabi từ nhiều định dạng khác nhau
  for (const file of files) {
    let key = null;
    
    // Trường hợp 1: Định dạng mới với storage.provider và storage.key
    if (file.storage?.provider === "wasabi" && file.storage?.key) {
      key = file.storage.key;
    } 
    // Trường hợp 2: Định dạng cũ với wasabiKey
    else if (file.wasabiKey) {
      key = file.wasabiKey;
    }
    // Trường hợp 3: Chỉ có key trực tiếp (từ kết quả tìm kiếm Wasabi)
    else if (file.key) {
      key = file.key;
    }
    // Trường hợp 4: Trường hợp URL chứa key
    else if (file.url && typeof file.url === 'string' && file.url.includes('wasabi')) {
      try {
        const urlObj = new URL(file.url);
        const pathParts = urlObj.pathname.split('/');
        // Loại bỏ phần đầu của pathname (thường là /bucket-name)
        if (pathParts.length > 2) {
          key = pathParts.slice(2).join('/');
        }
      } catch (e) {
        console.log(`Không thể trích xuất key từ URL: ${file.url}`);
      }
    }
    
    if (key) {
      filesToDelete.push({
        originalFile: file,
        key: key,
        name: file.name || 'unknown'
      });
    }
  }

  console.log(`Có ${filesToDelete.length} file hợp lệ cần xóa trên Wasabi`);
  console.log("Danh sách chi tiết các key đã tìm thấy:");
  filesToDelete.forEach((file, index) => {
    console.log(`${index + 1}. Key: ${file.key}, Tên: ${file.name}`);
  });

  // Xử lý theo batch
  for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
    const batch = filesToDelete.slice(i, i + BATCH_SIZE);
    console.log(
      `Đang xóa batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(
        filesToDelete.length / BATCH_SIZE
      )}, ${batch.length} file`
    );

    // Xóa song song các file trong batch
    const results = await Promise.all(
      batch.map(async (file, index) => {
        try {
          const deleted = await deleteFromWasabi(file.key);
          if (!deleted) {
            failedFiles.push({
              name: file.name,
              key: file.key
            });
          }
          return deleted;
        } catch (error) {
          console.error(`Lỗi xóa file index ${i + index}:`, error);
          failedFiles.push({
            name: file.name,
            key: file.key,
            error: error.message
          });
          return false;
        }
      })
    );

    // Đếm số file đã xóa thành công
    deletedCount += results.filter((result) => result === true).length;

    // Tạm dừng giữa các batch để tránh quá tải
    if (i + BATCH_SIZE < filesToDelete.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return {
    deletedCount,
    totalFiles: filesToDelete.length,
    failedFiles,
    allFilesDeletedSuccessfully: failedFiles.length === 0 && deletedCount === filesToDelete.length
  };
}

// Lấy tất cả các file từ cấu trúc mới (courseContents)
function collectFilesFromNewStructure(courseContent) {
  const files = [];
  
  if (!courseContent || !courseContent.sections) {
    console.log("Không tìm thấy nội dung khóa học hoặc không có sections");
    return files;
  }
  
  console.log(`Tìm thấy dữ liệu nội dung khóa học mới với ${courseContent.sections.length || 0} section`);
  
  // Duyệt qua từng chương (section)
  for (const section of courseContent.sections) {
    if (!section) continue;
    
    console.log(`Duyệt qua section: ${section.title} (${section.lessons?.length || 0} bài học)`);
    
    // Duyệt qua từng bài học
    for (const lesson of section.lessons || []) {
      if (!lesson) continue;
      
      console.log(`  Duyệt qua lesson: ${lesson.title}`);
      
      // Thu thập file trong lesson
      if (lesson.content && lesson.content.files && lesson.content.files.length > 0) {
        console.log(`    Tìm thấy ${lesson.content.files.length} file trong content`);
        files.push(...lesson.content.files);
      }

      // Thu thập file trong metadata nếu có
      if (lesson.metadata && lesson.metadata.files && lesson.metadata.files.length > 0) {
        console.log(`    Tìm thấy ${lesson.metadata.files.length} file trong metadata`);
        files.push(...lesson.metadata.files);
      }

      // Thu thập file trong subfolder từ metadata
      if (lesson.metadata && lesson.metadata.subfolders) {
        for (const subfolder of lesson.metadata.subfolders) {
          if (subfolder.files && subfolder.files.length > 0) {
            console.log(`    Tìm thấy ${subfolder.files.length} file trong subfolder ${subfolder.name || 'không tên'}`);
            files.push(...subfolder.files);
          }
        }
      }
    }
  }
  
  return files;
}

// Lấy tất cả các file từ cấu trúc cũ (courses.chapters)
function collectFilesFromOldStructure(courseData) {
  const files = [];
  
  if (!courseData || !courseData.chapters || !Array.isArray(courseData.chapters)) {
    console.log("Không tìm thấy cấu trúc chapters trong khóa học");
    return files;
  }
  
  console.log(`Khóa học sử dụng cấu trúc cũ với ${courseData.chapters.length} chương`);
  
  for (const chapter of courseData.chapters) {
    if (!chapter) continue;
    
    console.log(`Duyệt qua chương cũ: ${chapter.title} (${chapter.lessons?.length || 0} bài học)`);
    
    for (const lesson of chapter.lessons || []) {
      if (!lesson) continue;
      
      console.log(`  Duyệt qua bài học cũ: ${lesson.title}`);
      
      if (lesson.files && Array.isArray(lesson.files)) {
        console.log(`    Tìm thấy ${lesson.files.length} file cũ`);
        
        // Thêm trực tiếp toàn bộ files, không chuyển đổi
        files.push(...lesson.files);
      }
    }
  }
  
  return files;
}

// Kiểm tra tất cả các trường hợp đặc biệt để tìm key Wasabi
function scanForAdditionalWasabiKeys(courseData) {
  const additionalKeys = [];
  
  // Kiểm tra các trường thông thường có thể chứa key Wasabi
  const fieldsToCheck = ['coverImage', 'thumbnail', 'avatar', 'image', 'backgroundImage', 'logo'];
  
  for (const field of fieldsToCheck) {
    if (courseData[field]) {
      if (typeof courseData[field] === 'string' && courseData[field].includes('wasabi')) {
        // Trường hợp là URL Wasabi
        additionalKeys.push({
          url: courseData[field],
          name: `${field} của khóa học`,
          type: 'URL'
        });
      } else if (typeof courseData[field] === 'object') {
        // Trường hợp là object có thể chứa key
        if (courseData[field].key || courseData[field].wasabiKey) {
          additionalKeys.push({
            key: courseData[field].key || courseData[field].wasabiKey,
            name: `${field} của khóa học`,
            type: 'Object'
          });
        } else if (courseData[field].url && courseData[field].url.includes('wasabi')) {
          additionalKeys.push({
            url: courseData[field].url,
            name: `${field} của khóa học`,
            type: 'Object URL'
          });
        }
      }
    }
  }
  
  console.log(`Tìm thấy ${additionalKeys.length} key Wasabi bổ sung từ các trường đặc biệt`);
  return additionalKeys;
}

export async function POST(request) {
  try {
    const { courseId } = await request.json();

    if (!courseId) {
      return NextResponse.json(
        { error: "Vui lòng chọn khóa học để xóa" },
        { status: 400 }
      );
    }

    console.log(`=========== BẮT ĐẦU XÓA KHÓA HỌC: ${courseId} ===========`);

    // BƯỚC 1: Thu thập dữ liệu từ cả hai collections
    console.log("BƯỚC 1: Thu thập dữ liệu và danh sách file từ cả hai collections");
    
    // 1.1 Lấy dữ liệu khóa học từ collection courses
    const courseData = await findOneDocument("courses", { 
      _id: new ObjectId(courseId) 
    });

    if (!courseData) {
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    console.log(`Tìm thấy khóa học: ${courseData.title} (${courseId})`);

    // 1.2 Lấy nội dung khóa học từ collection courseContents
    const courseContent = await findOneDocument("courseContents", {
      courseId: new ObjectId(courseId)
    });

    if (courseContent) {
      console.log(`Tìm thấy nội dung khóa học trong courseContents (ID: ${courseContent._id})`);
    } else {
      console.log("Không tìm thấy nội dung khóa học trong collection courseContents");
    }

    // BƯỚC 2: Thu thập tất cả file cần xóa từ NHIỀU NGUỒN khác nhau
    console.log("BƯỚC 2: Thu thập danh sách tất cả file cần xóa");
    
    // 2.1 Thu thập file từ cấu trúc mới (courseContents)
    const filesFromNewStructure = courseContent ? collectFilesFromNewStructure(courseContent) : [];
    console.log(`Tìm thấy ${filesFromNewStructure.length} file từ cấu trúc mới (courseContents)`);
    
    // 2.2 Thu thập file từ cấu trúc cũ (courses.chapters)
    const filesFromOldStructure = collectFilesFromOldStructure(courseData);
    console.log(`Tìm thấy ${filesFromOldStructure.length} file từ cấu trúc cũ (courses.chapters)`);
    
    // 2.3 Tìm kiếm trong các trường đặc biệt của khóa học (coverImage, thumbnail, etc.)
    const additionalWasabiKeys = scanForAdditionalWasabiKeys(courseData);
    console.log(`Tìm thấy ${additionalWasabiKeys.length} key từ các trường đặc biệt`);
    
    // 2.4 Tìm kiếm trực tiếp trên Wasabi S3 theo tiền tố của khóa học
    const wasabiFiles = await findWasabiFilesByPrefix(courseId);
    console.log(`Tìm thấy ${wasabiFiles.length} file từ tìm kiếm trực tiếp trên Wasabi`);

    // Kết hợp tất cả file từ mọi nguồn
    const allFiles = [
      ...filesFromNewStructure, 
      ...filesFromOldStructure, 
      ...additionalWasabiKeys,
      ...wasabiFiles
    ];
    
    console.log(`TỔNG HỢP: Tìm thấy ${allFiles.length} file cần xóa từ tất cả các nguồn`);
    
    // BƯỚC 3: Xóa tất cả file trên Wasabi TRƯỚC
    console.log("BƯỚC 3: Xóa tất cả file trên Wasabi");
    const startTime = Date.now();
    const deleteResult = await deleteFilesInBatches(allFiles);
    const endTime = Date.now();

    console.log(
      `Kết quả xóa file: ${deleteResult.deletedCount}/${deleteResult.totalFiles} file trên Wasabi trong ${
        (endTime - startTime) / 1000
      } giây`
    );
    
    if (deleteResult.failedFiles.length > 0) {
      console.log("CẢNH BÁO: Có các file không xóa được:");
      deleteResult.failedFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. Key: ${file.key}, Tên: ${file.name}`);
        if (file.error) console.log(`     Lỗi: ${file.error}`);
      });
    }

    // BƯỚC 4: Chỉ sau khi xóa file xong, mới xóa dữ liệu trong MongoDB
    console.log("BƯỚC 4: Xóa dữ liệu trong MongoDB");
    
    // 4.1 Xóa trong collection courses
    console.log("4.1: Xóa dữ liệu trong collection courses");
    const courseDeleteResult = await deleteDocument("courses", { _id: new ObjectId(courseId) });
    console.log("Kết quả xóa khóa học (courses):", courseDeleteResult);
    
    // 4.2 Xóa trong collection courseContents (luôn cố gắng xóa, bất kể có tìm thấy trước đó hay không)
    console.log("4.2: Xóa dữ liệu trong collection courseContents");
    const contentDeleteResult = await deleteDocument("courseContents", { courseId: new ObjectId(courseId) });
    console.log("Kết quả xóa nội dung khóa học (courseContents):", contentDeleteResult);
    
    console.log(`=========== KẾT THÚC XÓA KHÓA HỌC: ${courseData.title} (${courseId}) ===========`);

    return NextResponse.json({
      success: true,
      data: {
        courseInfo: {
          id: courseId,
          title: courseData.title
        },
        filesFound: {
          fromNewStructure: filesFromNewStructure.length,
          fromOldStructure: filesFromOldStructure.length,
          fromAdditionalFields: additionalWasabiKeys.length,
          fromWasabiSearch: wasabiFiles.length,
          total: allFiles.length
        },
        filesDeletion: {
          totalFiles: deleteResult.totalFiles,
          deletedCount: deleteResult.deletedCount,
          failedFilesCount: deleteResult.failedFiles.length,
          processingTimeMs: endTime - startTime
        },
        databaseDeletion: {
          courses: courseDeleteResult ? true : false,
          courseContents: contentDeleteResult ? true : false
        },
        timing: {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          durationSeconds: (endTime - startTime) / 1000
        }
      },
      message: `Đã xóa khóa học "${courseData.title}" và ${deleteResult.deletedCount}/${
        deleteResult.totalFiles
      } file liên quan trong ${(endTime - startTime) / 1000} giây`,
    });
  } catch (error) {
    console.error("Chi tiết lỗi khi xóa khóa học:", error);
    return NextResponse.json(
      { 
        error: "Không thể xóa khóa học: " + error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
