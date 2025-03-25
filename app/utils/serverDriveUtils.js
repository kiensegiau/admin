import { google } from "googleapis";
import { checkAndRefreshToken, refreshDriveToken } from "@/lib/tokenRefresher";
import { readTokens } from "@/lib/tokenStorage";

// Khởi tạo Google Drive API client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

// Hàm lấy ID từ Google Drive URL
export function extractDriveId(url) {
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

// Hàm kiểm tra và làm mới token trước khi gọi API
export async function ensureValidToken() {
  try {
    // Đọc token hiện tại
    let tokens = await readTokens();
    if (!tokens) {
      throw new Error("Không tìm thấy token");
    }

    // Kiểm tra và làm mới token nếu cần
    if (
      tokens.expiry_date &&
      Date.now() >= tokens.expiry_date - 5 * 60 * 1000
    ) {
      console.log("Token sắp hết hạn hoặc đã hết hạn, đang làm mới...");
      const refreshedTokens = await refreshDriveToken();
      if (!refreshedTokens) {
        throw new Error("Không thể làm mới token");
      }
      tokens = refreshedTokens;
      console.log("Đã làm mới token thành công");
    }

    return tokens.access_token;
  } catch (error) {
    console.error("Lỗi khi kiểm tra token:", error);
    throw error;
  }
}

// Khởi tạo Drive client với token mới
export async function initializeDriveClient(accessToken) {
  try {
    // Nếu không cung cấp access token, lấy và kiểm tra token tự động
    if (!accessToken) {
      accessToken = await ensureValidToken();
    }

    oauth2Client.setCredentials({ access_token: accessToken });
    return google.drive({ version: "v3", auth: oauth2Client });
  } catch (error) {
    console.error("Lỗi khi khởi tạo Drive client:", error);
    throw error;
  }
}

// Thêm hàm retry cho các cuộc gọi API
async function retryWithNewToken(apiCall) {
  try {
    return await apiCall();
  } catch (error) {
    // Nếu lỗi là Invalid Credentials, thử làm mới token và gọi lại
    if (
      error.message.includes("Invalid Credentials") ||
      error.message.includes("invalid_grant") ||
      error.code === 401
    ) {
      console.log(
        "Token không hợp lệ hoặc hết hạn, đang làm mới và thử lại..."
      );
      const newAccessToken = await ensureValidToken();
      oauth2Client.setCredentials({ access_token: newAccessToken });
      return await apiCall();
    }
    throw error;
  }
}

export async function getFolderInfo(drive, folderId) {
  try {
    return await retryWithNewToken(async () => {
      const response = await drive.files.get({
        fileId: folderId,
        fields: "name,id,mimeType",
      });
      return response.data;
    });
  } catch (error) {
    console.error(`Lỗi khi lấy thông tin folder ${folderId}:`, error.message);
    // Trả về null thay vì throw error để caller có thể xử lý
    return null;
  }
}

export async function listFolderContents(drive, folderId) {
  try {
    return await retryWithNewToken(async () => {
      const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType, size)",
        orderBy: "name",
        pageSize: 1000,
      });
      return res.data.files;
    });
  } catch (error) {
    console.error(
      `Lỗi khi liệt kê nội dung folder ${folderId}:`,
      error.message
    );
    return [];
  }
}

/**
 * Quét đệ quy tất cả các folder con và file
 * @param {Object} drive - Google Drive API client
 * @param {string} folderId - ID của folder gốc
 * @param {Object} options - Tùy chọn
 * @param {boolean} options.includeFiles - Có bao gồm files hay không
 * @param {boolean} options.includeFolders - Có bao gồm thông tin folders hay không
 * @param {string[]} options.fileTypes - Các loại file cần lấy (mimeType)
 * @param {Function} options.progressCallback - Callback để cập nhật tiến trình
 * @returns {Promise<{files: Array, folders: Array, structure: Object}>}
 */
export async function listAllFolderContentsRecursive(
  drive,
  folderId,
  options = {}
) {
  const {
    includeFiles = true,
    includeFolders = true,
    fileTypes = [],
    progressCallback = null,
  } = options;

  // Kết quả
  const result = {
    files: [],
    folders: [],
    structure: {
      id: folderId,
      name: "",
      type: "folder",
      children: [],
    },
  };

  try {
    // Lấy thông tin folder gốc
    const folderInfo = await getFolderInfo(drive, folderId);
    result.structure.name = folderInfo.name;

    if (includeFolders) {
      result.folders.push({
        id: folderId,
        name: folderInfo.name,
        path: [folderInfo.name],
        level: 0,
      });
    }

    // Hàm quét đệ quy
    async function scanFolder(
      currentFolderId,
      path = [],
      level = 0,
      parentNode = null
    ) {
      if (progressCallback) {
        progressCallback(`Đang quét folder: ${path.join(" > ")}`);
      }

      // Lấy danh sách items trong folder hiện tại
      const items = await listFolderContents(drive, currentFolderId);

      // Tách files và folders
      const subFolders = items.filter(
        (item) => item.mimeType === "application/vnd.google-apps.folder"
      );
      const files = items.filter(
        (item) => item.mimeType !== "application/vnd.google-apps.folder"
      );

      // Thêm files vào kết quả nếu cần
      if (includeFiles) {
        let filteredFiles = files;
        if (fileTypes.length > 0) {
          filteredFiles = files.filter((file) =>
            fileTypes.includes(file.mimeType)
          );
        }

        filteredFiles.forEach((file) => {
          result.files.push({
            ...file,
            path: [...path],
            folderPath: [...path],
            folderId: currentFolderId,
            level,
          });

          if (parentNode) {
            parentNode.children.push({
              id: file.id,
              name: file.name,
              type: "file",
              mimeType: file.mimeType,
              size: file.size,
            });
          }
        });
      }

      // Quét các folder con
      for (const subFolder of subFolders) {
        const subFolderPath = [...path, subFolder.name];

        if (includeFolders) {
          result.folders.push({
            id: subFolder.id,
            name: subFolder.name,
            path: subFolderPath,
            level: level + 1,
          });
        }

        const subFolderNode = {
          id: subFolder.id,
          name: subFolder.name,
          type: "folder",
          children: [],
        };

        if (parentNode) {
          parentNode.children.push(subFolderNode);
        }

        // Đệ quy vào folder con
        await scanFolder(subFolder.id, subFolderPath, level + 1, subFolderNode);
      }
    }

    // Bắt đầu quét từ folder gốc
    await scanFolder(folderId, [folderInfo.name], 0, result.structure);

    return result;
  } catch (error) {
    console.error("Lỗi khi quét folder:", error);
    throw error;
  }
}
