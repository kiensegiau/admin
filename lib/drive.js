import { google } from "googleapis";

export async function getFileMetadata(fileId, tokens) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
    token_type: tokens.token_type,
    id_token: tokens.id_token,
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const response = await drive.files.get({
    fileId: fileId,
    fields: "id, name, mimeType, size",
  });

  return response.data;
}

export async function downloadFile(fileId, options = {}, tokens) {
  if (!tokens?.access_token) {
    throw new Error("Không có access token");
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );

  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    scope: tokens.scope,
    token_type: tokens.token_type,
    id_token: tokens.id_token,
  });

  const drive = google.drive({
    version: "v3",
    auth: oauth2Client,
  });

  console.log("Download options:", options);

  const requestOptions = {
    fileId: fileId,
    alt: "media",
    ...options,
  };

  // Thêm headers cho range request nếu có
  const downloadOptions = {
    responseType: "stream",
  };
  
  if (options.range) {
    downloadOptions.headers = {
      Range: options.range
    };
    console.log("Range request:", options.range);
  }

  try {
    const response = await drive.files.get(requestOptions, downloadOptions);
    
    // Kiểm tra response có đúng range không
    if (options.range && !response.headers["content-range"]) {
      throw new Error("Google Drive không hỗ trợ range request cho file này");
    }

    let bytesDownloaded = 0;
    const totalBytes = parseInt(response.headers["content-length"] || 0);

    response.data.on("data", (chunk) => {
      bytesDownloaded += chunk.length;
      const progress = totalBytes ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
      process.stdout.write(
        `\rĐang tải: ${(bytesDownloaded / (1024 * 1024)).toFixed(2)}/${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${progress}%)`
      );
    });

    response.data.on("end", () => {
      process.stdout.write(
        `\rĐã tải xong: ${(bytesDownloaded / (1024 * 1024)).toFixed(2)} MB\n`
      );
    });

    response.data.on("error", (err) => {
      console.error("Lỗi khi tải:", err);
    });

    return {
      stream: response.data,
      headers: response.headers,
      size: totalBytes
    };
  } catch (error) {
    console.error("Lỗi khi tải từ Google Drive:", error);
    throw error;
  }
}
