/**
 * Tiện ích cho import từ Google Drive
 */

/**
 * Xác định loại file dựa vào mimeType
 * @param {string} mimeType - MIME type của file
 * @returns {string} - Loại file
 */
export function getFileType(mimeType) {
  if (!mimeType) return "unknown";
  
  if (mimeType.startsWith("video/")) {
    return "video";
  }
  
  if (mimeType.startsWith("audio/")) {
    return "audio";
  }
  
  if (mimeType === "application/pdf") {
    return "pdf";
  }
  
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  
  if (mimeType.includes("document") || 
      mimeType.includes("sheet") || 
      mimeType.includes("presentation")) {
    return "document";
  }
  
  return "file";
} 