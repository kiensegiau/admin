import { NextResponse } from "next/server";
import { ObjectId, findOneDocument } from "@/lib/db";
import axios from "axios";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  initializeDriveClient,
  listFolderContents,
  getFolderInfo,
} from "@/app/utils/serverDriveUtils";
import { readTokens } from "@/lib/tokenStorage";
import { refreshDriveToken } from "@/lib/tokenRefresher";
import { encryptId } from "@/lib/encryption";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import os from "os";
import fs from "fs";
import { pipeline } from "stream/promises";
import { PutObjectCommand } from "@aws-sdk/client-s3";

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

// Hàm kiểm tra file trên Wasabi
async function checkWasabiFile(key) {
  if (!key) return false;

  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === "NotFound") {
      console.log(`File không tồn tại trên Wasabi: ${key}`);
      return false;
    }
    console.error(`Lỗi khi kiểm tra file trên Wasabi: ${error.message}`);
    return false;
  }
}

export async function POST(request) {
  try {
    const requestData = await request.json();
    console.log("Dữ liệu nhận được từ client:", JSON.stringify(requestData));

    // Đảm bảo các tham số đúng kiểu dữ liệu
    const courseId = requestData.courseId;
    // Chuyển đổi sang boolean rõ ràng để tránh các vấn đề với kiểu dữ liệu
    const checkWithDrive = requestData.checkWithDrive === true;

    // Mặc định autoFix luôn là true không phụ thuộc vào giá trị từ client
    const autoFix = true;

    if (!courseId) {
      return NextResponse.json({ error: "Thiếu courseId" }, { status: 400 });
    }

    console.log(`Bắt đầu kiểm tra khóa học: ${courseId}`);
    console.log(
      `Chi tiết tham số nhận được: checkWithDrive=${checkWithDrive}, autoFix=${autoFix} (${typeof autoFix})`
    );

    // Lấy thông tin khóa học
    const courseData = await findOneDocument("courses", { _id: new ObjectId(courseId) });

    if (!courseData) {
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    console.log(`Đang kiểm tra khóa học: ${courseData.title}`);

    // Chuẩn bị Google Drive API nếu cần autoFix
    let drive = null;
    if (autoFix) {
      console.log("🔄 Chuẩn bị Google Drive API cho tự động sửa lỗi...");
      try {
        // Đọc token từ storage
        let tokens = await readTokens();
        if (!tokens) {
          console.warn(
            "⚠️ Không tìm thấy token Google Drive. Tắt chế độ tải lại từ Drive."
          );
        } else {
          console.log("✓ Đã đọc token Google Drive thành công");

          // Tự động làm mới token nếu hết hạn
          if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
            console.log(
              "⚠️ Token Google Drive đã hết hạn, đang tự động làm mới..."
            );
            const refreshedTokens = await refreshDriveToken();
            if (refreshedTokens) {
              console.log("✓ Đã làm mới token Google Drive thành công");
              tokens = refreshedTokens;
            } else {
              console.error("❌ Không thể làm mới token Google Drive");
              return NextResponse.json(
                { error: "Không thể làm mới Google Drive token" },
                { status: 401 }
              );
            }
          }

          // Khởi tạo Drive client
          try {
            drive = await initializeDriveClient();
            if (drive) {
              console.log("✅ Đã khởi tạo Google Drive API thành công");

              // Kiểm tra xem client có hoạt động không bằng cách gọi một API đơn giản
              try {
                const response = await drive.about.get({
                  fields: "user",
                });
                console.log(
                  `✅ Xác nhận Drive API hoạt động, user: ${
                    response.data.user?.displayName || "Không xác định"
                  }`
                );
              } catch (testError) {
                console.error(
                  "❌ Drive API không hoạt động:",
                  testError.message
                );
                drive = null;
              }
            } else {
              console.error("❌ Không thể khởi tạo Google Drive client");
            }
          } catch (initError) {
            console.error("❌ Lỗi khi khởi tạo Drive client:", initError);
            drive = null;
          }
        }
      } catch (error) {
        console.error("❌ Lỗi khi chuẩn bị Drive API:", error);
        console.warn("⚠️ Tắt chế độ tự động tải file từ Drive");
        drive = null;
      }
    } else {
      console.log("ℹ️ Bỏ qua khởi tạo Drive API vì autoFix = false");
    }

    // Khởi tạo thống kê
    const stats = {
      chaptersCount: 0,
      lessonsCount: 0,
      filesCount: 0,
      wasabiFiles: 0,
      brokenFiles: 0,
      duplicates: 0,
      missingFiles: 0,
      fixedFiles: 0,
      reuploadedFiles: 0, // Thêm thống kê file đã tải lại
    };

    // Danh sách các file bị lỗi
    const brokenFiles = [];
    const duplicateFiles = [];
    const missingFiles = [];
    const fixedFiles = [];
    const reuploadedFiles = []; // Thêm danh sách file đã tải lại

    // Tạo Map để theo dõi file trùng lặp
    const fileKeysMap = new Map();

    // Mảng chứa các chương đã được cập nhật
    const updatedChapters = [];
    let needsUpdate = false;

    // Kiểm tra và xử lý từng chương
    for (
      let chapterIndex = 0;
      chapterIndex < courseData.chapters.length;
      chapterIndex++
    ) {
      const chapter = courseData.chapters[chapterIndex];
      stats.chaptersCount++;
      let isChapterModified = false;
      const updatedLessons = [];

      // Kiểm tra và xử lý từng bài học
      for (
        let lessonIndex = 0;
        lessonIndex < chapter.lessons.length;
        lessonIndex++
      ) {
        const lesson = chapter.lessons[lessonIndex];
        stats.lessonsCount++;
        let isLessonModified = false;
        const updatedFiles = [];
        const updatedSubfolders = [];

        // Tạo đường dẫn thư mục cho lesson
        const lessonPath = `${courseData.title}/${chapter.title}/${lesson.title}`;

        // Kiểm tra và xử lý files trong bài học
        for (
          let fileIndex = 0;
          fileIndex < (lesson.files || []).length;
          fileIndex++
        ) {
          const file = lesson.files[fileIndex];
          stats.filesCount++;

          // Kiểm tra file có trên Wasabi không
          if (file.storage?.provider === "wasabi" && file.storage?.key) {
            stats.wasabiFiles++;
            const exists = await checkWasabiFile(file.storage.key);

            if (!exists) {
              stats.brokenFiles++;

              const brokenFile = {
                id: file.id,
                name: file.name,
                key: file.storage.key,
                chapterId: chapter.id,
                chapterTitle: chapter.title,
                lessonId: lesson.id,
                lessonTitle: lesson.title,
              };

              brokenFiles.push(brokenFile);

              if (autoFix) {
                if (!drive) {
                  console.log(
                    `⚠️ Không thể tải từ Drive: Drive client chưa được khởi tạo hoặc token không hợp lệ`
                  );
                } else if (!file.driveFileId) {
                  console.log(
                    `⚠️ File "${file.name}" không có driveFileId, không thể tải lại từ Drive`
                  );
                } else {
                  console.log(
                    `[AutoFix] Đang tải lại file "${file.name}" (ID: ${file.driveFileId}) từ Drive lên Wasabi...`
                  );
                  try {
                    // Tải trực tiếp từ Drive và upload lên Wasabi ngay
                    const uploadResult = await uploadToWasabi(
                      drive,
                      file.driveFileId,
                      file.name,
                      file.mimeType || "application/octet-stream",
                      lessonPath
                    );

                    if (uploadResult.success) {
                      // Xác minh thêm một lần nữa file đã tồn tại trên Wasabi
                      const wasabiVerified = await checkWasabiFile(
                        uploadResult.key
                      );

                      if (wasabiVerified) {
                        console.log(
                          `✅ Đã tải lên Wasabi thành công và đã xác minh: ${uploadResult.key}`
                        );

                        // Cập nhật thông tin file với key Wasabi mới
                        const updatedFile = {
                          ...file,
                          storage: {
                            provider: "wasabi",
                            key: uploadResult.key,
                            size: uploadResult.size,
                            uploadTime: new Date().toISOString(),
                          },
                        };

                        updatedFiles.push(updatedFile);
                        reuploadedFiles.push({
                          ...brokenFile,
                          newKey: uploadResult.key,
                        });

                        stats.reuploadedFiles++;
                        isLessonModified = true;
                        needsUpdate = true;
                        continue;
                      } else {
                        console.error(
                          `❌ Upload lên Wasabi không thể xác minh: ${uploadResult.key}`
                        );
                      }
                    } else {
                      console.warn(
                        `⚠️ Không thể tải lại file từ Drive: ${uploadResult.error}`
                      );
                    }
                  } catch (uploadError) {
                    console.error(
                      `❌ Lỗi khi tải lại file từ Drive:`,
                      uploadError
                    );
                  }
                }

                // Nếu không tải được, dùng phương án dự phòng
                console.log(
                  `⚠️ Sử dụng phương án dự phòng: Tạo proxyUrl cho file "${file.name}"`
                );
                const fixedFile = {
                  ...file,
                  storage: null, // Xóa key Wasabi
                };

                // Thêm proxyUrl nếu có driveFileId
                if (file.driveFileId) {
                  const encryptedId = encryptId(file.driveFileId);
                  fixedFile.proxyUrl = `/api/proxy/files?id=${encryptedId}`;
                  console.log(`✓ Đã tạo proxyUrl cho file: ${file.name}`);
                } else {
                  console.log(
                    `⚠️ Không thể tạo proxyUrl vì thiếu driveFileId: ${file.name}`
                  );
                }

                updatedFiles.push(fixedFile);
                fixedFiles.push(brokenFile);
                stats.fixedFiles++;
                isLessonModified = true;
                needsUpdate = true;
              } else {
                console.log(
                  `ℹ️ Bỏ qua tự động sửa file "${file.name}" vì autoFix = false`
                );
                updatedFiles.push(file);
              }
            } else {
              updatedFiles.push(file);

              // Kiểm tra trùng lặp
              if (fileKeysMap.has(file.storage.key)) {
                stats.duplicates++;
                duplicateFiles.push({
                  id: file.id,
                  name: file.name,
                  key: file.storage.key,
                  originalFile: fileKeysMap.get(file.storage.key),
                  chapterId: chapter.id,
                  chapterTitle: chapter.title,
                  lessonId: lesson.id,
                  lessonTitle: lesson.title,
                });
              } else {
                fileKeysMap.set(file.storage.key, {
                  id: file.id,
                  name: file.name,
                  chapterId: chapter.id,
                  chapterTitle: chapter.title,
                  lessonId: lesson.id,
                  lessonTitle: lesson.title,
                });
              }
            }
          } else {
            updatedFiles.push(file);

            if (!file.proxyUrl && !file.storage) {
              // File thiếu cả Wasabi key và proxy URL
              stats.missingFiles++;
              missingFiles.push({
                id: file.id,
                name: file.name,
                chapterId: chapter.id,
                chapterTitle: chapter.title,
                lessonId: lesson.id,
                lessonTitle: lesson.title,
              });
            }
          }
        }

        // Kiểm tra và xử lý từng subfolder
        for (
          let subfolderIndex = 0;
          subfolderIndex < (lesson.subfolders || []).length;
          subfolderIndex++
        ) {
          const subfolder = lesson.subfolders[subfolderIndex];
          let isSubfolderModified = false;
          const updatedSubfolderFiles = [];

          // Tạo đường dẫn thư mục cho subfolder
          const subfolderPath = `${lessonPath}/${subfolder.name}`;

          // Kiểm tra và xử lý files trong subfolder
          for (
            let fileIndex = 0;
            fileIndex < (subfolder.files || []).length;
            fileIndex++
          ) {
            const file = subfolder.files[fileIndex];
            stats.filesCount++;

            // Kiểm tra file có trên Wasabi không
            if (file.storage?.provider === "wasabi" && file.storage?.key) {
              stats.wasabiFiles++;
              const exists = await checkWasabiFile(file.storage.key);

              if (!exists) {
                stats.brokenFiles++;

                const brokenFile = {
                  id: file.id,
                  name: file.name,
                  key: file.storage.key,
                  chapterId: chapter.id,
                  chapterTitle: chapter.title,
                  lessonId: lesson.id,
                  lessonTitle: lesson.title,
                  subfolderId: subfolder.id,
                  subfolderName: subfolder.name,
                };

                brokenFiles.push(brokenFile);

                if (autoFix) {
                  if (!drive) {
                    console.log(
                      `⚠️ Không thể tải từ Drive: Drive client chưa được khởi tạo hoặc token không hợp lệ`
                    );
                  } else if (!file.driveFileId) {
                    console.log(
                      `⚠️ File "${file.name}" không có driveFileId, không thể tải lại từ Drive`
                    );
                  } else {
                    console.log(
                      `[AutoFix] Đang tải lại file "${file.name}" (ID: ${file.driveFileId}) từ Drive lên Wasabi...`
                    );
                    try {
                      // Tải trực tiếp từ Drive và upload lên Wasabi ngay
                      const uploadResult = await uploadToWasabi(
                        drive,
                        file.driveFileId,
                        file.name,
                        file.mimeType || "application/octet-stream",
                        subfolderPath
                      );

                      if (uploadResult.success) {
                        // Xác minh thêm một lần nữa file đã tồn tại trên Wasabi
                        const wasabiVerified = await checkWasabiFile(
                          uploadResult.key
                        );

                        if (wasabiVerified) {
                          console.log(
                            `✅ Đã tải lên Wasabi thành công và đã xác minh: ${uploadResult.key}`
                          );

                          // Cập nhật thông tin file với key Wasabi mới
                          const updatedFile = {
                            ...file,
                            storage: {
                              provider: "wasabi",
                              key: uploadResult.key,
                              size: uploadResult.size,
                              uploadTime: new Date().toISOString(),
                            },
                          };

                          updatedSubfolderFiles.push(updatedFile);
                          reuploadedFiles.push({
                            ...brokenFile,
                            newKey: uploadResult.key,
                          });

                          stats.reuploadedFiles++;
                          isSubfolderModified = true;
                          needsUpdate = true;
                          continue;
                        } else {
                          console.error(
                            `❌ Upload lên Wasabi không thể xác minh: ${uploadResult.key}`
                          );
                        }
                      } else {
                        console.warn(
                          `⚠️ Không thể tải lại file từ Drive: ${uploadResult.error}`
                        );
                      }
                    } catch (uploadError) {
                      console.error(
                        `❌ Lỗi khi tải lại file từ Drive:`,
                        uploadError
                      );
                    }
                  }

                  // Nếu không tải được, dùng phương án dự phòng
                  console.log(
                    `⚠️ Sử dụng phương án dự phòng: Tạo proxyUrl cho file "${file.name}"`
                  );
                  const fixedFile = {
                    ...file,
                    storage: null, // Xóa key Wasabi
                  };

                  // Thêm proxyUrl nếu có driveFileId
                  if (file.driveFileId) {
                    const encryptedId = encryptId(file.driveFileId);
                    fixedFile.proxyUrl = `/api/proxy/files?id=${encryptedId}`;
                    console.log(`✓ Đã tạo proxyUrl cho file: ${file.name}`);
                  } else {
                    console.log(
                      `⚠️ Không thể tạo proxyUrl vì thiếu driveFileId: ${file.name}`
                    );
                  }

                  updatedSubfolderFiles.push(fixedFile);
                  fixedFiles.push(brokenFile);
                  stats.fixedFiles++;
                  isSubfolderModified = true;
                  needsUpdate = true;
                } else {
                  console.log(
                    `ℹ️ Bỏ qua tự động sửa file "${file.name}" vì autoFix = false`
                  );
                  updatedSubfolderFiles.push(file);
                }
              } else {
                updatedSubfolderFiles.push(file);

                // Kiểm tra trùng lặp
                if (fileKeysMap.has(file.storage.key)) {
                  stats.duplicates++;
                  duplicateFiles.push({
                    id: file.id,
                    name: file.name,
                    key: file.storage.key,
                    originalFile: fileKeysMap.get(file.storage.key),
                    chapterId: chapter.id,
                    chapterTitle: chapter.title,
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    subfolderId: subfolder.id,
                    subfolderName: subfolder.name,
                  });
                } else {
                  fileKeysMap.set(file.storage.key, {
                    id: file.id,
                    name: file.name,
                    chapterId: chapter.id,
                    chapterTitle: chapter.title,
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    subfolderId: subfolder.id,
                    subfolderName: subfolder.name,
                  });
                }
              }
            } else {
              updatedSubfolderFiles.push(file);

              if (!file.proxyUrl && !file.storage) {
                // File thiếu cả Wasabi key và proxy URL
                stats.missingFiles++;
                missingFiles.push({
                  id: file.id,
                  name: file.name,
                  chapterId: chapter.id,
                  chapterTitle: chapter.title,
                  lessonId: lesson.id,
                  lessonTitle: lesson.title,
                  subfolderId: subfolder.id,
                  subfolderName: subfolder.name,
                });
              }
            }
          }

          if (isSubfolderModified) {
            isLessonModified = true;
          }

          updatedSubfolders.push({
            ...subfolder,
            files: updatedSubfolderFiles,
          });
        }

        // Thêm lesson đã cập nhật vào mảng
        if (isLessonModified) {
          isChapterModified = true;
          updatedLessons.push({
            ...lesson,
            files: updatedFiles,
            subfolders: updatedSubfolders,
          });
        } else {
          updatedLessons.push(lesson);
        }
      }

      // Thêm chapter đã cập nhật vào mảng
      if (isChapterModified) {
        updatedChapters.push({
          ...chapter,
          lessons: updatedLessons,
        });
      } else {
        updatedChapters.push(chapter);
      }
    }

    // Cập nhật database nếu có autoFix và có file được sửa
    let updateResult = null;
    if (
      autoFix &&
      needsUpdate &&
      (stats.fixedFiles > 0 || stats.reuploadedFiles > 0)
    ) {
      try {
        const totalFixedFiles = stats.fixedFiles + stats.reuploadedFiles;
        console.log(`Đang cập nhật ${totalFixedFiles} file bị lỗi...`);

        // Thêm kiểm tra để đảm bảo chỉ cập nhật database khi có file được sửa đúng
        if (reuploadedFiles.length > 0) {
          console.log(
            `Kiểm tra xác minh ${reuploadedFiles.length} file đã upload lên Wasabi:`
          );

          // Xác minh lại một lần nữa trên Wasabi trước khi cập nhật database
          let allFilesVerified = true;
          for (const file of reuploadedFiles) {
            if (file.newKey) {
              const exists = await checkWasabiFile(file.newKey);
              if (!exists) {
                console.error(
                  `❌ File ${file.name} với key ${file.newKey} không tồn tại trên Wasabi!`
                );
                allFilesVerified = false;
              } else {
                console.log(
                  `✓ Xác minh file ${file.name} với key ${file.newKey} tồn tại trên Wasabi`
                );
              }
            }
          }

          if (!allFilesVerified) {
            console.error(
              "⚠️ Phát hiện một số file không tồn tại trên Wasabi. Không cập nhật database để đảm bảo dữ liệu nhất quán."
            );
            updateResult = {
              success: false,
              error: "Một số file không tồn tại trên Wasabi sau khi upload",
              message:
                "Không thể cập nhật khóa học vì có file không tồn tại trên Wasabi",
            };
            return NextResponse.json({
              ...result,
              updateResult,
              warning:
                "Không cập nhật database do một số file không tồn tại trên Wasabi",
            });
          }
        }

        // Cập nhật lại khóa học
        await findOneDocument("courses", { _id: new ObjectId(courseId) }, {
          $set: {
            chapters: updatedChapters,
            updatedAt: new Date().toISOString(),
          },
        });

        console.log(
          `Đã sửa thành công ${totalFixedFiles} file bị lỗi trong khóa học ${courseId}`
        );

        updateResult = {
          success: true,
          fixedCount: stats.fixedFiles,
          reuploadedCount: stats.reuploadedFiles,
          message: `Đã sửa ${totalFixedFiles} file bị lỗi (${stats.reuploadedFiles} file được tải lại từ Drive)`,
        };
      } catch (updateError) {
        console.error("Lỗi khi cập nhật khóa học:", updateError);
        updateResult = {
          success: false,
          error: updateError.message,
          message: "Không thể cập nhật khóa học",
        };
      }
    }

    // Kiểm tra nếu vẫn còn file cần cập nhật
    const stillNeedsUpdate =
      brokenFiles.length > stats.fixedFiles + stats.reuploadedFiles ||
      duplicateFiles.length > 0 ||
      missingFiles.length > 0;

    // Tạo kết quả trả về
    const result = {
      courseId,
      title: courseData.title,
      driveUrl: courseData.driveUrl || null,
      driveFolderId: courseData.driveFolderId || null,
      stats,
      brokenFiles,
      duplicateFiles,
      missingFiles,
      fixedFiles: autoFix ? fixedFiles : [],
      reuploadedFiles: autoFix ? reuploadedFiles : [],
      needsUpdate: stillNeedsUpdate,
      structureCheck: true,
      wasabiCheck: brokenFiles.length === 0,
      duplicatesCheck: duplicateFiles.length === 0 && missingFiles.length === 0,
      hasDriveUrl: !!courseData.driveUrl,
      autoFix,
      updateResult,
    };

    // Nếu cần kiểm tra với Drive và khóa học có driveUrl
    if (checkWithDrive && courseData.driveUrl) {
      console.log("Đang kiểm tra với Google Drive");

      // Kiểm tra nếu không có driveFolderId
      if (!courseData.driveFolderId) {
        console.warn(
          "Không có driveFolderId trong cơ sở dữ liệu, cố gắng trích xuất từ driveUrl"
        );
        const extractedId = extractDriveId(courseData.driveUrl);
        if (extractedId) {
          console.log(
            `Đã trích xuất ID: ${extractedId} từ URL: ${courseData.driveUrl}`
          );
          courseData.driveFolderId = extractedId;
        } else {
          console.error(
            `Không thể trích xuất ID từ URL: ${courseData.driveUrl}`
          );
          result.driveCheck = {
            success: false,
            error: "Không thể trích xuất ID thư mục từ Drive URL",
          };
          return NextResponse.json(result);
        }
      }

      // Xác thực với Google Drive
      let tokens;
      try {
        tokens = await readTokens();

        if (!tokens) {
          console.error("Không tìm thấy token Google Drive");
          result.driveCheck = {
            success: false,
            error: "Chưa có token Google Drive",
          };
          return NextResponse.json(result);
        }

        if (tokens.expiry_date && Date.now() >= tokens.expiry_date) {
          console.log("Token hết hạn, đang làm mới...");
          tokens = await refreshDriveToken();
          if (!tokens) {
            console.error("Không thể làm mới token");
            result.driveCheck = {
              success: false,
              error: "Token hết hạn và không thể làm mới",
            };
            return NextResponse.json(result);
          }
          console.log("Đã làm mới token thành công");
        }

        // Khởi tạo Drive client
        console.log("Đang khởi tạo Drive client");
        const drive = await initializeDriveClient();
        console.log("Đã khởi tạo Drive client thành công");

        // Kiểm tra thư mục tồn tại trước khi lấy cấu trúc
        console.log(`Đang kiểm tra thư mục Drive: ${courseData.driveFolderId}`);
        const folderCheck = await getFolderInfo(
          drive,
          courseData.driveFolderId
        );
        if (!folderCheck) {
          console.error(
            `Thư mục Drive không tồn tại hoặc không có quyền truy cập: ${courseData.driveFolderId}`
          );
          result.driveCheck = {
            success: false,
            error: "Thư mục Drive không tồn tại hoặc không có quyền truy cập",
          };
          return NextResponse.json(result);
        }
        console.log(`Đã tìm thấy thư mục Drive: ${folderCheck.name}`);

        // Lấy thông tin từ Drive
        console.log("Bắt đầu lấy cấu trúc thư mục từ Drive...");
        const driveFiles = await getDriveStructure(
          drive,
          courseData.driveFolderId
        );

        // So sánh với cấu trúc hiện tại trong database
        if (driveFiles) {
          result.driveCheck = { success: true };
          result.driveComparison = compareDriveWithDb(driveFiles, courseData);
        } else {
          console.error("Không thể lấy cấu trúc thư mục từ Drive");
          result.driveCheck = {
            success: false,
            error: "Không thể lấy cấu trúc thư mục từ Drive",
          };
        }
      } catch (driveError) {
        console.error("Lỗi khi kiểm tra với Google Drive:", driveError);
        result.driveCheck = {
          success: false,
          error: `Lỗi khi kiểm tra với Google Drive: ${driveError.message}`,
        };
      }
    }

    console.log(`Kết thúc kiểm tra khóa học: ${courseId}`);
    console.log(
      `Tìm thấy: ${brokenFiles.length} file lỗi, ${duplicateFiles.length} file trùng lặp, ${missingFiles.length} file thiếu thông tin`
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Lỗi khi kiểm tra khóa học:", error);
    return NextResponse.json(
      { error: "Không thể kiểm tra khóa học: " + error.message },
      { status: 500 }
    );
  }
}

// Hàm lấy cấu trúc thư mục từ Google Drive
async function getDriveStructure(drive, folderId, depth = 0, maxDepth = 3) {
  if (!folderId) return null;

  // Giới hạn độ sâu đệ quy để tránh stack overflow
  if (depth > maxDepth) {
    console.log(`Đã đạt giới hạn độ sâu ${maxDepth} cho thư mục: ${folderId}`);
    return {
      folders: {},
      files: {},
      truncated: true,
    };
  }

  try {
    console.log(`Đang lấy cấu trúc thư mục (độ sâu ${depth}): ${folderId}`);
    const result = {
      folders: {},
      files: {},
      truncated: false,
    };

    // Lấy thông tin thư mục gốc
    const folderInfo = await getFolderInfo(drive, folderId);
    if (!folderInfo) {
      console.warn(`Không thể lấy thông tin thư mục: ${folderId}`);
      return null;
    }

    console.log(`Đã tìm thấy thư mục: ${folderInfo.name} (${folderId})`);

    // Lấy danh sách nội dung
    try {
      const contents = await listFolderContents(drive, folderId);
      console.log(
        `Đã tìm thấy ${contents.length} mục trong thư mục ${folderInfo.name}`
      );

      // Phân loại thư mục và file
      const folders = contents.filter(
        (item) => item.mimeType === "application/vnd.google-apps.folder"
      );
      const files = contents.filter(
        (item) => item.mimeType !== "application/vnd.google-apps.folder"
      );

      console.log(
        `Thư mục ${folderInfo.name} có ${folders.length} thư mục con và ${files.length} file`
      );

      // Lưu thông tin file
      for (const file of files) {
        result.files[file.id] = {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          modifiedTime: file.modifiedTime,
        };
      }

      // Xử lý thư mục con với giới hạn tối đa 10 thư mục để tránh quá tải
      const maxFolders = 10;
      const processedFolders = folders.slice(0, maxFolders);

      if (folders.length > maxFolders) {
        console.warn(
          `Giới hạn số lượng thư mục con của ${folderInfo.name} từ ${folders.length} xuống ${maxFolders}`
        );
        result.truncated = true;
      }

      // Xử lý các thư mục con với độ sâu tăng lên
      for (const folder of processedFolders) {
        console.log(
          `Đang xử lý thư mục con: ${folder.name} (độ sâu ${depth + 1})`
        );
        try {
          result.folders[folder.id] = {
            id: folder.id,
            name: folder.name,
            ...(await getDriveStructure(drive, folder.id, depth + 1, maxDepth)),
          };
        } catch (subFolderError) {
          console.error(
            `Lỗi khi xử lý thư mục con ${folder.name}:`,
            subFolderError.message
          );
          result.folders[folder.id] = {
            id: folder.id,
            name: folder.name,
            error: subFolderError.message,
            folders: {},
            files: {},
          };
        }
      }
    } catch (contentsError) {
      console.error(
        `Lỗi khi lấy nội dung thư mục ${folderInfo.name}:`,
        contentsError.message
      );
      return {
        id: folderId,
        name: folderInfo.name,
        error: contentsError.message,
        folders: {},
        files: {},
      };
    }

    return result;
  } catch (error) {
    console.error(
      `Lỗi khi lấy cấu trúc từ Drive (${folderId}):`,
      error.message
    );
    return null;
  }
}

// Hàm so sánh cấu trúc Drive với database
function compareDriveWithDb(driveStructure, courseData) {
  if (!driveStructure) return null;

  console.log("Bắt đầu so sánh dữ liệu Drive với database...");

  const result = {
    missingFolders: [], // Thư mục có trên Drive nhưng không có trong DB
    extraFolders: [], // Thư mục có trong DB nhưng không có trên Drive
    missingFiles: [], // File có trên Drive nhưng không có trong DB
    extraFiles: [], // File có trong DB nhưng không có trên Drive
    modifiedFiles: [], // File đã được cập nhật trên Drive
    summary: {
      driveFolderCount: 0,
      driveFileCount: 0,
      dbChapterCount: courseData.chapters?.length || 0,
      dbLessonCount: 0,
      dbFileCount: 0,
    },
  };

  // Đếm số lượng tệp và thư mục trong Drive
  function countDriveItems(structure) {
    if (!structure) return { folders: 0, files: 0 };

    let folderCount = Object.keys(structure.folders || {}).length;
    let fileCount = Object.keys(structure.files || {}).length;

    // Đếm đệ quy cho các thư mục con
    for (const folderId in structure.folders || {}) {
      const subCounts = countDriveItems(structure.folders[folderId]);
      folderCount += subCounts.folders;
      fileCount += subCounts.files;
    }

    return { folders: folderCount, files: fileCount };
  }

  // Đếm số lượng tệp trong database
  function countDbItems(courseData) {
    let lessonCount = 0;
    let fileCount = 0;

    // Đếm số bài học và tệp
    for (const chapter of courseData.chapters || []) {
      lessonCount += chapter.lessons?.length || 0;

      // Đếm tệp trong mỗi bài học
      for (const lesson of chapter.lessons || []) {
        fileCount += lesson.files?.length || 0;

        // Đếm tệp trong các thư mục con
        for (const subfolder of lesson.subfolders || []) {
          fileCount += subfolder.files?.length || 0;
        }
      }
    }

    return { lessons: lessonCount, files: fileCount };
  }

  try {
    // Đếm số lượng mục trong Drive
    const driveCounts = countDriveItems(driveStructure);
    result.summary.driveFolderCount = driveCounts.folders;
    result.summary.driveFileCount = driveCounts.files;

    // Đếm số lượng mục trong database
    const dbCounts = countDbItems(courseData);
    result.summary.dbLessonCount = dbCounts.lessons;
    result.summary.dbFileCount = dbCounts.files;

    console.log("Thống kê Drive:", {
      thưMục: driveCounts.folders,
      tệp: driveCounts.files,
    });

    console.log("Thống kê Database:", {
      chương: courseData.chapters?.length || 0,
      bàiHọc: dbCounts.lessons,
      tệp: dbCounts.files,
    });

    // Ghi chú về việc cần phát triển thêm logic so sánh chi tiết
    console.log("Đã hoàn thành so sánh cơ bản giữa Drive và database");
  } catch (error) {
    console.error("Lỗi khi thực hiện so sánh:", error.message);
    result.error = error.message;
  }

  return result;
}

// Hàm lấy ID từ Google Drive URL
function extractDriveId(url) {
  if (!url) return null;

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

// Hàm làm sạch tên file để tránh lỗi khi lưu file
function sanitizeFileName(fileName) {
  if (!fileName) return "unknown-file";

  // Danh sách các ký tự không hợp lệ trong tên file
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;

  // Thay thế các ký tự không hợp lệ bằng dấu gạch ngang
  let sanitized = fileName.replace(invalidChars, "-");

  // Xử lý khoảng trắng
  sanitized = sanitized.replace(/\s+/g, "-");

  // Loại bỏ nhiều dấu gạch ngang liên tiếp
  sanitized = sanitized.replace(/-+/g, "-");

  // Loại bỏ dấu gạch ngang ở đầu và cuối
  sanitized = sanitized.replace(/^-+|-+$/g, "");

  // Đảm bảo tên file không vượt quá 255 ký tự
  if (sanitized.length > 255) {
    const ext = path.extname(sanitized);
    sanitized = sanitized.substring(0, 255 - ext.length) + ext;
  }

  // Đảm bảo tên file không rỗng
  if (!sanitized) {
    sanitized = "file-" + Date.now();
  }

  return sanitized;
}

// Hàm xử lý đường dẫn an toàn cho Wasabi
function sanitizeWasabiPath(path) {
  if (!path) return "";

  // Xử lý từng phần của đường dẫn
  const parts = path.split("/").map((part) => {
    if (!part) return "";

    let sanitized = part;

    // Thay thế các ký tự không hợp lệ trên Wasabi
    sanitized = sanitized
      .replace(/[<>:"\/\\|?*\x00-\x1F]/g, "-") // Ký tự không hợp lệ
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
    console.warn(`Đường dẫn quá dài, đã cắt bớt: ${result.length} ký tự`);
    return result.substring(0, 900);
  }

  return result;
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
    console.log(`Bắt đầu upload file ${fileName} (${fileId}) lên Wasabi...`);
    tempDir = path.join(os.tmpdir(), "hocmai-temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Làm sạch tên file để lưu vào bộ nhớ tạm
    const sanitizedFileName = sanitizeFileName(fileName);
    tempFilePath = path.join(tempDir, sanitizedFileName);

    console.log(`Đang tải file ${fileName} từ Google Drive...`);

    // Biến theo dõi tốc độ tải
    const downloadStartTime = Date.now();
    let lastProgressTime = Date.now();
    let downloadedBytes = 0;
    let totalBytes = 0;

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
          `Tải xuống: ${percent}% (${downloadedMB}/${totalMB} MB) - Tốc độ: ${currentSpeed} MB/s`
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
        writer.end();
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
      // Upload file lên Wasabi
      await s3Client.send(command);

      // Xác minh file đã được tải lên thành công
      let verificationSuccess = false;
      let maxVerifyAttempts = 3;
      let verifyAttempt = 0;

      // Thử xác minh nhiều lần để đối phó với độ trễ của Wasabi
      while (verifyAttempt < maxVerifyAttempts && !verificationSuccess) {
        verifyAttempt++;
        try {
          // Tạm dừng một chút để đảm bảo hệ thống Wasabi đã cập nhật
          if (verifyAttempt > 1) {
            console.log(`Chờ xác minh lần ${verifyAttempt}...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }

          const checkCommand = new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
          });

          const headResponse = await s3Client.send(checkCommand);

          if (
            headResponse &&
            headResponse.ContentLength === fileBuffer.length
          ) {
            console.log(
              `✅ Xác minh upload thành công: ${key} (${headResponse.ContentLength} bytes)`
            );
            verificationSuccess = true;
          } else {
            console.warn(
              `⚠️ Kích thước file không khớp sau khi upload: ${key}`
            );
          }
        } catch (verifyErr) {
          console.warn(
            `⚠️ Không thể xác minh file sau khi upload (nỗ lực ${verifyAttempt}/${maxVerifyAttempts}): ${key}`,
            verifyErr.name
          );
        }
      }

      // Nếu không thể xác minh sau nhiều lần thử, coi như upload thất bại
      if (!verificationSuccess) {
        console.error(
          `❌ Không thể xác minh file sau ${maxVerifyAttempts} lần thử: ${key}`
        );
        throw new Error("Không thể xác minh file sau khi upload");
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
