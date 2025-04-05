import { NextResponse } from "next/server";
import { ObjectId, findOneDocument, updateDocument } from "@/lib/db";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

export const dynamic = "force-dynamic";

// Khởi tạo Wasabi client
const s3Client = new S3Client({
  region: process.env.WASABI_REGION || "ap-southeast-1",
  endpoint:
    process.env.WASABI_ENDPOINT || "https://s3.ap-southeast-1.wasabisys.com",
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID,
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.WASABI_BUCKET_NAME || "hocmai";

// Hàm xóa file từ Wasabi storage
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
    if (error.name === "NotFound" || error.name === "NoSuchKey") {
      console.warn(`File không tồn tại trên Wasabi (key: ${key}), bỏ qua xóa`);
      // Xem như đã xóa thành công nếu file không tồn tại
      return true;
    }
    console.error(`Lỗi khi xóa file từ Wasabi (${key}):`, error);
    return false;
  }
}

export async function POST(request) {
  try {
    const {
      courseId,
      brokenFiles = [],
      duplicateFiles = [],
      missingFiles = [],
    } = await request.json();

    if (!courseId) {
      return NextResponse.json({ error: "Thiếu courseId" }, { status: 400 });
    }

    console.log(`Bắt đầu cập nhật khóa học: ${courseId}`);
    console.log(
      `Số lượng file cần xử lý: ${brokenFiles.length} lỗi, ${duplicateFiles.length} trùng lặp, ${missingFiles.length} thiếu`
    );

    // Lấy thông tin khóa học
    const courseData = await findOneDocument("courses", { _id: new ObjectId(courseId) });
    if (!courseData) {
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    let deletedFiles = 0;
    let updatedFiles = 0;

    // Clone các chương để cập nhật
    const updatedChapters = JSON.parse(
      JSON.stringify(courseData.chapters || [])
    );

    // Xử lý các file bị lỗi trên Wasabi
    for (const brokenFile of brokenFiles) {
      const { chapterId, lessonId, subfolderId, id, key } = brokenFile;

      console.log(`Xử lý file lỗi: ${brokenFile.name} (ID: ${id})`);

      // Xóa file khỏi Wasabi
      if (key) {
        await deleteFromWasabi(key);
      }

      // Cập nhật trong Firestore
      const chapterIndex = updatedChapters.findIndex((c) => c.id === chapterId);
      if (chapterIndex >= 0) {
        const lessonIndex = updatedChapters[chapterIndex].lessons.findIndex(
          (l) => l.id === lessonId
        );
        if (lessonIndex >= 0) {
          if (subfolderId) {
            // File trong subfolder
            const subfolderIndex = updatedChapters[chapterIndex].lessons[
              lessonIndex
            ].subfolders.findIndex((s) => s.id === subfolderId);
            if (subfolderIndex >= 0) {
              const fileIndex = updatedChapters[chapterIndex].lessons[
                lessonIndex
              ].subfolders[subfolderIndex].files.findIndex((f) => f.id === id);
              if (fileIndex >= 0) {
                // Xóa reference đến Wasabi
                delete updatedChapters[chapterIndex].lessons[lessonIndex]
                  .subfolders[subfolderIndex].files[fileIndex].storage;
                console.log(
                  `Đã xóa reference Wasabi cho file ${brokenFile.name} trong subfolder`
                );
                updatedFiles++;
              }
            }
          } else {
            // File trực tiếp trong lesson
            const fileIndex = updatedChapters[chapterIndex].lessons[
              lessonIndex
            ].files.findIndex((f) => f.id === id);
            if (fileIndex >= 0) {
              // Xóa reference đến Wasabi
              delete updatedChapters[chapterIndex].lessons[lessonIndex].files[
                fileIndex
              ].storage;
              console.log(
                `Đã xóa reference Wasabi cho file ${brokenFile.name} trong lesson`
              );
              updatedFiles++;
            }
          }
        }
      }
    }

    // Xử lý các file trùng lặp - xóa file
    for (const duplicateFile of duplicateFiles) {
      const { chapterId, lessonId, subfolderId, id, name, key } = duplicateFile;

      console.log(`Xử lý file trùng lặp: ${name} (ID: ${id})`);

      // Cập nhật trong Firestore - xóa file trùng lặp
      const chapterIndex = updatedChapters.findIndex((c) => c.id === chapterId);
      if (chapterIndex >= 0) {
        const lessonIndex = updatedChapters[chapterIndex].lessons.findIndex(
          (l) => l.id === lessonId
        );
        if (lessonIndex >= 0) {
          if (subfolderId) {
            // File trong subfolder
            const subfolderIndex = updatedChapters[chapterIndex].lessons[
              lessonIndex
            ].subfolders.findIndex((s) => s.id === subfolderId);
            if (subfolderIndex >= 0) {
              // Tìm kiếm file trùng lặp
              const fileIndex = updatedChapters[chapterIndex].lessons[
                lessonIndex
              ].subfolders[subfolderIndex].files.findIndex((f) => f.id === id);
              if (fileIndex >= 0) {
                // Xóa file khỏi Wasabi nếu có
                if (
                  updatedChapters[chapterIndex].lessons[lessonIndex].subfolders[
                    subfolderIndex
                  ].files[fileIndex].storage?.provider === "wasabi"
                ) {
                  const fileKey =
                    updatedChapters[chapterIndex].lessons[lessonIndex]
                      .subfolders[subfolderIndex].files[fileIndex].storage.key;
                  await deleteFromWasabi(fileKey);
                }

                // Xóa file khỏi danh sách
                updatedChapters[chapterIndex].lessons[lessonIndex].subfolders[
                  subfolderIndex
                ].files.splice(fileIndex, 1);
                console.log(`Đã xóa file trùng lặp ${name} từ subfolder`);
                deletedFiles++;
              }
            }
          } else {
            // File trực tiếp trong lesson
            const fileIndex = updatedChapters[chapterIndex].lessons[
              lessonIndex
            ].files.findIndex((f) => f.id === id);
            if (fileIndex >= 0) {
              // Xóa file khỏi Wasabi nếu có
              if (
                updatedChapters[chapterIndex].lessons[lessonIndex].files[
                  fileIndex
                ].storage?.provider === "wasabi"
              ) {
                const fileKey =
                  updatedChapters[chapterIndex].lessons[lessonIndex].files[
                    fileIndex
                  ].storage.key;
                await deleteFromWasabi(fileKey);
              }

              // Xóa file khỏi danh sách
              updatedChapters[chapterIndex].lessons[lessonIndex].files.splice(
                fileIndex,
                1
              );
              console.log(`Đã xóa file trùng lặp ${name} từ lesson`);
              deletedFiles++;
            }
          }
        }
      }
    }

    // Cập nhật dữ liệu trong Firestore
    await updateDocument("courses", { _id: new ObjectId(courseId) }, {
      chapters: updatedChapters,
      updatedAt: new Date().toISOString(),
    });

    console.log(
      `Hoàn thành cập nhật khóa học ${courseId}: ${deletedFiles} file đã xóa, ${updatedFiles} file đã cập nhật`
    );

    return NextResponse.json({
      courseId,
      title: courseData.title,
      deletedFiles,
      updatedFiles,
      message: `Đã cập nhật khóa học: ${deletedFiles} file đã xóa, ${updatedFiles} file đã cập nhật`,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật khóa học:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật khóa học: " + error.message },
      { status: 500 }
    );
  }
}
