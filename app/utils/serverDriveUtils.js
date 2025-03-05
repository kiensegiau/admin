import { google } from "googleapis";

// Khởi tạo Google Drive API client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.CALLBACK_URL
);

export async function initializeDriveClient(accessToken) {
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

export async function getFolderInfo(drive, folderId) {
  const response = await drive.files.get({
    fileId: folderId,
    fields: "name,id,mimeType",
  });
  return response.data;
}

export async function listFolderContents(drive, folderId) {
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id, name, mimeType, size)",
    orderBy: "name",
    pageSize: 1000,
  });
  return res.data.files;
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
