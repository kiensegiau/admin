import React, { useState, useCallback, useEffect } from "react";
import { Progress, message, Spin } from 'antd';

export default function B2UploadModal({ onClose, courseId, chapterId, lessonId, courseName, chapterName, lessonName, onFileAdded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDriveVerified, setIsDriveVerified] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0] || null);
  };

  const checkDriveVerification = useCallback(async () => {
    const accessToken = document.cookie.split('; ').find(row => row.startsWith('googleDriveAccessToken='))?.split('=')[1];
    if (accessToken) {
      try {
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        setIsDriveVerified(response.ok);
      } catch (error) {
        console.error('Lỗi khi kiểm tra xác minh Google Drive:', error);
        setIsDriveVerified(false);
      }
    } else {
      setIsDriveVerified(false);
    }
  }, []);

  useEffect(() => {
    checkDriveVerification();
  }, [checkDriveVerification]);

  const handleUpload = async () => {
    if (!file) {
      message.error("Vui lòng chọn file để upload");
      return;
    }

    setUploading(true);
    setErrorMessage('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("courseName", courseName);
    formData.append("chapterName", chapterName);
    formData.append("lessonName", lessonName);
    formData.append("courseId", courseId);
    formData.append("chapterId", chapterId);
    formData.append("lessonId", lessonId);

    try {
      const response = await fetch('/api/upload-and-segment-video', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      message.success("Video đã được upload, phân đoạn và lưu trữ thành công");
      onFileAdded(result);
      onClose();
    } catch (error) {
      console.error("Lỗi khi upload:", error);
      setErrorMessage(`Lỗi khi upload video: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
      <div className="bg-white p-5 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Upload Video</h2>
        {!isDriveVerified ? (
          <div>
            <p className="mb-4">Bạn cần xác minh Google Drive trước khi tải lên.</p>
            <button
              onClick={checkDriveVerification}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300"
            >
              Xác minh Google Drive
            </button>
          </div>
        ) : (
          <>
            <input type="file" onChange={handleFileChange} accept="video/*" className="mb-4" />
            {errorMessage && <p className="text-red-500 mb-4">{errorMessage}</p>}
            {uploading ? (
              <div className="mb-4">
                <Spin spinning={uploading} tip="Đang xử lý...">
                  <Progress percent={uploadProgress} status="active" />
                </Spin>
              </div>
            ) : (
              <div className="flex justify-end">
                <button onClick={onClose} className="mr-2 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition duration-300">Hủy</button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-300 ${
                    (!file || uploading) && 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  {uploading ? "Đang xử lý..." : "Upload"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}