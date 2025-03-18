export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

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

// Xóa nhiều file song song theo batch
async function deleteFilesInBatches(files) {
  const BATCH_SIZE = 10; // Số file xử lý song song mỗi lần
  let deletedCount = 0;

  // Lấy danh sách tất cả các file cần xóa
  const filesToDelete = files.filter(
    (file) => file.storage?.provider === "wasabi" && file.storage?.key
  );

  console.log(`Chuẩn bị xóa ${filesToDelete.length} file trên Wasabi`);

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
      batch.map(async (file) => {
        const deleted = await deleteFromWasabi(file.storage.key);
        return deleted;
      })
    );

    // Đếm số file đã xóa thành công
    deletedCount += results.filter((result) => result === true).length;

    // Tạm dừng giữa các batch để tránh quá tải
    if (i + BATCH_SIZE < filesToDelete.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  return deletedCount;
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

    if (!db) {
      throw new Error("Firestore chưa được khởi tạo");
    }

    // Lấy dữ liệu khóa học trước khi xóa
    const courseRef = db.collection("courses").doc(courseId);
    const courseDoc = await courseRef.get();

    if (!courseDoc.exists) {
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    const courseData = courseDoc.data();
    console.log(`Bắt đầu xóa khóa học: ${courseData.title} (${courseId})`);

    // Thu thập tất cả file cần xóa
    const allFiles = [];

    // Duyệt qua từng chương
    for (const chapter of courseData.chapters || []) {
      // Duyệt qua từng bài học
      for (const lesson of chapter.lessons || []) {
        // Thu thập file trong lesson
        if (lesson.files && lesson.files.length > 0) {
          allFiles.push(...lesson.files);
        }

        // Thu thập file trong subfolder
        for (const subfolder of lesson.subfolders || []) {
          if (subfolder.files && subfolder.files.length > 0) {
            allFiles.push(...subfolder.files);
          }
        }
      }
    }

    console.log(`Đã tìm thấy tổng cộng ${allFiles.length} file trong khóa học`);

    // Xóa tất cả file song song theo batch
    const startTime = Date.now();
    const deletedFilesCount = await deleteFilesInBatches(allFiles);
    const endTime = Date.now();

    console.log(
      `Đã xóa ${deletedFilesCount}/${allFiles.length} file trên Wasabi trong ${
        (endTime - startTime) / 1000
      } giây`
    );

    // Sau khi xóa tất cả file, xóa document khóa học
    await courseRef.delete();
    console.log(`Đã xóa khóa học: ${courseData.title} (${courseId})`);

    return NextResponse.json({
      success: true,
      deletedFilesCount,
      totalFiles: allFiles.length,
      processingTimeMs: endTime - startTime,
      message: `Đã xóa khóa học và ${deletedFilesCount}/${
        allFiles.length
      } file liên quan trong ${(endTime - startTime) / 1000} giây`,
    });
  } catch (error) {
    console.error("Lỗi khi xóa khóa học:", error);
    return NextResponse.json(
      { error: "Không thể xóa khóa học: " + error.message },
      { status: 500 }
    );
  }
}
