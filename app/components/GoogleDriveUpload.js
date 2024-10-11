'use client';

import { useState } from 'react';
import { uploadToDrive } from '../utils/driveUpload';

export default function GoogleDriveUpload() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const accessToken = document.cookie.split('; ').find(row => row.startsWith('googleDriveAccessToken='))?.split('=')[1];
      if (!accessToken) {
        throw new Error('Không có access token. Vui lòng kết nối với Google Drive.');
      }

      const fileData = {
        name: file.name,
        type: file.type,
        content: await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(file);
        }),
      };

      const result = await uploadToDrive(fileData, accessToken);
      setUploadResult(result);
    } catch (error) {
      console.error('Lỗi khi tải lên:', error);
      setUploadResult({ error: error.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h2 className="text-xl font-bold mb-4">Tải lên Google Drive</h2>
      <input type="file" onChange={handleFileChange} className="mb-4" />
      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-400"
      >
        {uploading ? 'Đang tải lên...' : 'Tải lên'}
      </button>
      {uploadResult && (
        <div className="mt-4">
          {uploadResult.error ? (
            <p className="text-red-500">{uploadResult.error}</p>
          ) : (
            <p className="text-green-500">
              Tải lên thành công. <a href={uploadResult.webViewLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Xem file</a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}