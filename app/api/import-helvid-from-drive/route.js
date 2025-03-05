export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { HelvidUploader } from "@/app/api/helvid-uploader/route";
import {
  initializeDriveClient,
  getFolderInfo,
  listFolderContents,
} from "@/app/utils/serverDriveUtils";

/**
 * Trích xuất ID folder từ Google Drive URL
 */
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

/**
 * Lọc ra chỉ các file video từ danh sách file
 */
function filterVideoFiles(files) {
  // Các định dạng MIME cho video
  const videoMimeTypes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-ms-wmv",
    "video/mpeg",
    "video/webm",
    "video/ogg",
  ];

  return files.filter((file) => videoMimeTypes.includes(file.mimeType));
}

/**
 * Lấy danh sách tất cả các file video trong folder và các subfolder
 */
async function getAllVideoFiles(drive, folderId) {
  console.log(`Đang lấy thông tin từ folder: ${folderId}`);

  try {
    // Lấy tất cả các file trong folder
    const files = await listFolderContents(drive, folderId);

    // Lọc ra chỉ các file video
    const videoFiles = filterVideoFiles(files);

    console.log(`Tìm thấy ${videoFiles.length} file video trong folder`);

    return videoFiles;
  } catch (error) {
    console.error("Lỗi khi lấy danh sách file:", error);
    throw new Error(`Không thể lấy danh sách file: ${error.message}`);
  }
}

/**
 * Upload danh sách video lên Helvid
 */
async function uploadVideosToHelvid(videos) {
  console.log(`Bắt đầu upload ${videos.length} video lên Helvid`);

  const helvidUploader = new HelvidUploader();
  const results = [];

  for (const video of videos) {
    console.log(`Đang xử lý video: ${video.name} (ID: ${video.id})`);

    try {
      // Tạo URL đầy đủ cho file
      const driveUrl = `https://drive.google.com/file/d/${video.id}/view?usp=sharing`;

      // Upload video lên Helvid với tên là ID của file Drive
      const uploadResult = await helvidUploader.uploadFromDrive(
        driveUrl,
        video.id
      );

      if (uploadResult.success) {
        console.log(
          `Upload thành công video ${video.name}, DID: ${uploadResult.data.id}`
        );

        // Lấy thông tin chi tiết về video đã upload
        const videoDetails = await helvidUploader.getVideoDetails(
          uploadResult.data.id
        );

        results.push({
          fileName: video.id, // Sử dụng ID Drive làm tên file
          originalName: video.name,
          driveId: video.id,
          success: true,
          did: uploadResult.data.id,
          videoUrl: videoDetails.success ? videoDetails.data.videoUrl : null,
          embedUrl: videoDetails.success ? videoDetails.data.embedUrl : null,
        });
      } else {
        console.error(
          `Lỗi khi upload video ${video.name}:`,
          uploadResult.error
        );
        results.push({
          fileName: video.id,
          originalName: video.name,
          driveId: video.id,
          success: false,
          error: uploadResult.error,
        });
      }

      // Đợi 3 giây trước khi upload file tiếp theo để tránh quá tải
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`Lỗi khi xử lý video ${video.name}:`, error);
      results.push({
        fileName: video.id,
        originalName: video.name,
        driveId: video.id,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { folderUrl } = body;

    if (!folderUrl) {
      return NextResponse.json(
        { error: "URL folder Google Drive là bắt buộc" },
        { status: 400 }
      );
    }

    // Trích xuất ID folder từ URL
    const folderId = extractDriveId(folderUrl);

    if (!folderId) {
      return NextResponse.json(
        { error: "Không thể trích xuất ID folder từ URL" },
        { status: 400 }
      );
    }

    console.log(`Bắt đầu import từ folder ${folderId}`);

    // Khởi tạo Google Drive client
    const drive = await initializeDriveClient();

    // Lấy thông tin folder
    const folderInfo = await getFolderInfo(drive, folderId);
    console.log(`Đã tìm thấy folder: ${folderInfo.name}`);

    // Lấy danh sách tất cả các file video
    const videoFiles = await getAllVideoFiles(drive, folderId);

    if (videoFiles.length === 0) {
      return NextResponse.json(
        { message: "Không tìm thấy file video nào trong folder", results: [] },
        { status: 200 }
      );
    }

    // Upload tất cả video lên Helvid
    const uploadResults = await uploadVideosToHelvid(videoFiles);

    // Tổng kết kết quả
    const successCount = uploadResults.filter(
      (result) => result.success
    ).length;

    return NextResponse.json({
      message: `Hoàn thành import ${successCount}/${videoFiles.length} video từ folder ${folderInfo.name}`,
      folderName: folderInfo.name,
      totalVideos: videoFiles.length,
      successCount,
      results: uploadResults,
    });
  } catch (error) {
    console.error("Lỗi khi xử lý request:", error);
    return NextResponse.json(
      { error: `Lỗi khi xử lý request: ${error.message}` },
      { status: 500 }
    );
  }
}
