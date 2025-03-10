# API Upload lên Wasabi S3

API này cung cấp các endpoint để tương tác với dịch vụ lưu trữ Wasabi S3.

## Cài đặt

### 1. Biến môi trường

Thêm các biến môi trường sau vào file `.env.local`:

```env
# Cấu hình Wasabi S3
WASABI_ACCESS_KEY_ID=your_access_key_id
WASABI_SECRET_ACCESS_KEY=your_secret_access_key
WASABI_BUCKET_NAME=your_bucket_name
WASABI_REGION=ap-southeast-1
WASABI_ENDPOINT=https://s3.ap-southeast-1.wasabisys.com
```

### 2. Dependencies

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner uuid
```

## Các endpoint API

### 1. Lấy signed URL để upload trực tiếp

- **URL**: `/api/upload-to-wasabi`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "fileName": "example.mp4", // optional
    "fileType": "video/mp4",
    "fileSize": 1024000 // optional
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "uploadUrl": "https://...", // URL để upload trực tiếp
    "fileUrl": "https://...", // URL để truy cập file sau khi upload
    "key": "videos/1234567890-example.mp4"
  }
  ```

### 2. Upload file trực tiếp

- **URL**: `/api/upload-to-wasabi/direct`
- **Method**: `POST`
- **Body**: `FormData` với các field:
  - `file`: File cần upload
  - `filename`: Tên file tùy chỉnh (optional)
  - `folder`: Thư mục lưu trữ (mặc định: "videos")
- **Response**:
  ```json
  {
    "success": true,
    "fileUrl": "https://...",
    "key": "videos/1234567890-example.mp4",
    "fileName": "example.mp4",
    "size": 1024000,
    "contentType": "video/mp4"
  }
  ```

### 3. Kiểm tra file

- **URL**: `/api/upload-to-wasabi?key=videos/1234567890-example.mp4`
- **Method**: `GET`
- **Response**:
  ```json
  {
    "success": true,
    "fileUrl": "https://...",
    "key": "videos/1234567890-example.mp4"
  }
  ```

### 4. Xóa file

- **URL**: `/api/upload-to-wasabi/delete`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "key": "videos/1234567890-example.mp4"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "message": "Đã xóa file thành công",
    "key": "videos/1234567890-example.mp4"
  }
  ```

## Ví dụ sử dụng

### 1. Upload qua signed URL (Client-side)

```javascript
// 1. Lấy signed URL
async function getUploadUrl(file) {
  const response = await fetch("/api/upload-to-wasabi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    }),
  });

  return await response.json();
}

// 2. Upload file trực tiếp lên Wasabi
async function uploadFile(file) {
  try {
    // Lấy URL ký
    const { uploadUrl, fileUrl, key } = await getUploadUrl(file);

    // Upload trực tiếp lên Wasabi
    await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": file.type,
      },
    });

    // Trả về thông tin file đã upload
    return { fileUrl, key };
  } catch (error) {
    console.error("Lỗi khi upload file:", error);
    throw error;
  }
}
```

### 2. Upload trực tiếp (Server-side)

```javascript
// Upload form với FormData
async function uploadFileDirectly(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("filename", file.name); // optional
  formData.append("folder", "videos"); // optional

  const response = await fetch("/api/upload-to-wasabi/direct", {
    method: "POST",
    body: formData,
  });

  return await response.json();
}
```

### 3. Xóa file

```javascript
async function deleteFile(key) {
  const response = await fetch("/api/upload-to-wasabi/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });

  return await response.json();
}
```
