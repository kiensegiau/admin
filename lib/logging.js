export function logRequest(request, message, userId) {
  console.log(`[${new Date().toISOString()}] ${request.method} ${request.url} - ${message} - User: ${userId}`);
}

export function logError(request, error) {
  console.error(`[${new Date().toISOString()}] ${request.method} ${request.url} - Error:`, error);
} 