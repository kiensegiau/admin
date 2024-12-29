class FileHandler {
  // Định nghĩa các loại file được hỗ trợ
  static MIME_TYPES = {
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    
    // Images
    'jpg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    
    // Video
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    
    // Archives
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed'
  };

  static async handleFile(fileId, fileType) {
    try {
      // Xác định loại file và cache strategy
      const mimeType = this.MIME_TYPES[fileType] || 'application/octet-stream';
      const cacheStrategy = this.getCacheStrategy(fileType);
      
      // Lấy file từ Drive
      const file = await downloadFile(fileId);
      
      // Cache settings
      const cacheSettings = {
        path: cacheStrategy.path,
        ttl: cacheStrategy.ttl,
        mimeType: mimeType
      };
      
      return {
        file,
        ...cacheSettings
      };
    } catch (error) {
      console.error('File handling error:', error);
      throw error;
    }
  }

  static getCacheStrategy(fileType) {
    // Cache strategy cho từng loại file
    const strategies = {
      // Documents - cache 3 ngày
      'pdf': { path: 'doc_cache', ttl: 259200 },
      'doc': { path: 'doc_cache', ttl: 259200 },
      'docx': { path: 'doc_cache', ttl: 259200 },
      
      // Images - cache 7 ngày
      'jpg': { path: 'file_cache', ttl: 604800 },
      'png': { path: 'file_cache', ttl: 604800 },
      
      // Video - cache 7 ngày
      'mp4': { path: 'video_cache', ttl: 604800 },
      'webm': { path: 'video_cache', ttl: 604800 },
      
      // Default - cache 1 ngày
      'default': { path: 'file_cache', ttl: 86400 }
    };
    
    return strategies[fileType] || strategies.default;
  }
}

export default FileHandler; 