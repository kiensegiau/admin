class ErrorHandler {
  static MAX_RETRIES = 3;
  static RETRY_DELAY = 1000; // 1 second

  static async handleStreamError(error, videoId, attempt = 1) {
    if (attempt > this.MAX_RETRIES) {
      throw new Error('Max retries exceeded');
    }

    try {
      switch (error.code) {
        case 'NETWORK_ERROR':
          await this.handleNetworkError(videoId);
          break;
        case 'CACHE_ERROR':
          await this.handleCacheError(videoId);
          break;
        case 'DRIVE_ERROR':
          await this.handleDriveError(videoId);
          break;
        default:
          await this.handleGenericError(error);
      }

      // Log error for analytics
      await this.logError(error, videoId, attempt);

    } catch (retryError) {
      // Wait and retry
      await new Promise(r => setTimeout(r, this.RETRY_DELAY));
      return this.handleStreamError(error, videoId, attempt + 1);
    }
  }

  static logRequest(request, message, userId) {
    console.log(`[${new Date().toISOString()}] ${request.method} ${request.url} - ${message} - User: ${userId}`);
  }

  static logError(request, error) {
    console.error(`[${new Date().toISOString()}] ${request.method} ${request.url} - Error:`, error);
  }
}

export default ErrorHandler; 