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

const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB mỗi chunk
const MAX_PARALLEL_CHUNKS = 5; // Số lượng chunks tải song song tối đa

async function downloadChunk(drive, fileId, start, end, options = {}) {
  const response = await drive.files.get(
    {
      fileId: fileId,
      alt: "media",
      ...options,
    },
    {
      responseType: "stream",
      headers: {
        Range: `bytes=${start}-${end}`
      }
    }
  );
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

  // Lấy kích thước file
  const metadata = await drive.files.get({
    fileId: fileId,
    fields: "size",
  });
  
  const fileSize = parseInt(metadata.data.size);
  const chunks = [];
  
  // Chia file thành các chunks
  for (let start = 0; start < fileSize; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
    chunks.push({ start, end });
  }

  console.log(`Chia file thành ${chunks.length} chunks để tải song song`);

  // Tạo PassThrough stream để ghi kết quả
  const { PassThrough } = require('stream');
  const outputStream = new PassThrough();

  let downloadedSize = 0;
  const updateProgress = (chunkSize) => {
    downloadedSize += chunkSize;
    const progress = (downloadedSize / fileSize * 100).toFixed(2);
    process.stdout.write(`\rĐã tải: ${progress}% (${(downloadedSize / (1024 * 1024)).toFixed(2)}MB/${(fileSize / (1024 * 1024)).toFixed(2)}MB)`);
  };

  // Tải chunks song song
  const downloadChunks = async () => {
    for (let i = 0; i < chunks.length; i += MAX_PARALLEL_CHUNKS) {
      const chunkGroup = chunks.slice(i, i + MAX_PARALLEL_CHUNKS);
      const downloads = chunkGroup.map(({ start, end }) => {
        return new Promise(async (resolve, reject) => {
          try {
            const chunkStream = await downloadChunk(drive, fileId, start, end, options);
            const chunkData = [];
            
            chunkStream.on('data', chunk => {
              chunkData.push(chunk);
              updateProgress(chunk.length);
            });

            chunkStream.on('end', () => {
              resolve({
                start,
                data: Buffer.concat(chunkData)
              });
            });

            chunkStream.on('error', reject);
          } catch (error) {
            reject(error);
          }
        });
      });

      const downloadedChunks = await Promise.all(downloads);
      
      // Sắp xếp và ghi chunks theo thứ tự
      downloadedChunks.sort((a, b) => a.start - b.start);
      for (const chunk of downloadedChunks) {
        outputStream.write(chunk.data);
      }
    }
    outputStream.end();
  };

  // Bắt đầu tải
  downloadChunks().catch(error => {
    console.error("Lỗi khi tải chunks:", error);
    outputStream.destroy(error);
  });

  return outputStream;
}
