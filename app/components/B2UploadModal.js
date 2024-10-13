import React, { useState, useCallback, useEffect } from "react";
import { Progress, message, Spin } from 'antd';

export default function B2UploadModal({ onClose, courseId, chapterId, lessonId, courseName, chapterName, lessonName, onFileAdded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isDriveVerified, setIsDriveVerified] = useState(false);
  const [currentStep, setCurrentStep] = useState('');

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

    console.log('Bắt đầu upload file:', file.name);
    setUploading(true);
    setErrorMessage('');
    setUploadProgress(0);
    setCurrentStep('Đang chuẩn bị upload');

    const formData = new FormData();
    formData.append("file", file);
    formData.append("courseName", courseName);
    formData.append("chapterName", chapterName);
    formData.append("lessonName", lessonName);
    formData.append("courseId", courseId);
    formData.append("chapterId", chapterId);
    formData.append("lessonId", lessonId);

    try {
      console.log('Gửi request upload');
      let response;
      if (file.type.startsWith('video/')) {
        response = await fetch('/api/upload-and-segment-video', {
          method: 'POST',
          body: formData
        });
      } else {
        response = await fetch('/api/upload-file', {
          method: 'POST',
          body: formData
        });
      }

      console.log('Nhận response từ server');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const decodedChunk = decoder.decode(value, { stream: true });
        const lines = decodedChunk.split('\n\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            console.log('Nhận dữ liệu từ server:', data);
            if (data.error) {
              throw new Error(data.error);
            }
            setUploadProgress(prevProgress => data.progress || prevProgress);
            setCurrentStep(prevStep => data.step || prevStep);
          }
        }
      }

      console.log('Upload hoàn thành');
      message.success("File đã được upload và lưu trữ thành công");
      onFileAdded();
      onClose();
    } catch (error) {
      console.error("Lỗi khi upload:", error);
      setErrorMessage(`Lỗi khi upload file: ${error.message}`);
    } finally {
      setUploading(false);
      console.log('Kết thúc quá trình upload');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
      <div className="bg-white p-5 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Upload File</h2>
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
            <input type="file" onChange={handleFileChange} accept="video/*,application/pdf,application/zip,image/*" className="mb-4" />
            {errorMessage && <p className="text-red-500 mb-4">{errorMessage}</p>}
            {uploading ? (
              <div className="mb-4">
                <Spin spinning={uploading} tip={currentStep}>
                  <Progress percent={uploadProgress} status="active" />
                </Spin>
                <p className="mt-2">{currentStep}</p>
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
