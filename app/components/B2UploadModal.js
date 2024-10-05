import React, { useState } from "react";
import { Progress, message } from 'antd';

export default function B2UploadModal({ onClose, courseId, chapterId, lessonId, courseName, chapterName, lessonName, onFileAdded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      message.error("Vui lòng chọn file để upload");
      return;
    }

    setUploading(true);
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
      message.success("Video đã được upload và phân đoạn thành công");
      onFileAdded(result);
      onClose();
    } catch (error) {
      console.error("Lỗi khi upload:", error);
      message.error("Có lỗi xảy ra khi upload video");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
      <div className="bg-white p-5 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Upload Video</h2>
        <input type="file" onChange={handleFileChange} accept="video/*" className="mb-4" />
        {uploading && <Progress percent={uploadProgress} status="active" />}
        <div className="flex justify-end">
          <button onClick={onClose} className="mr-2 px-4 py-2 bg-gray-200 text-gray-800 rounded">Hủy</button>
          <button onClick={handleUpload} disabled={!file || uploading} className="px-4 py-2 bg-blue-500 text-white rounded">
            {uploading ? "Đang xử lý..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}