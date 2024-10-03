import React, { useState } from "react";
import { authorizeB2, uploadToB2 } from '../utils/b2Upload';

export default function B2UploadModal({
  onClose,
  onFileAdded,  courseName,
  chapterName,
  lessonName,
}) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setErrorMessage("");
    try {
      console.log('Bắt đầu quá trình tải lên B2');
      console.log('Đang xác thực B2');
      const authData = await authorizeB2();
      console.log('Xác thực B2 thành công:', authData);

      const safeChapterName = chapterName || 'unknown_chapter';
      const b2Path = `courses/${courseName}/${safeChapterName}/${lessonName}`;
      console.log('Đường dẫn B2:', b2Path);
      console.log('Bắt đầu tải file lên B2');
      const b2FileId = await uploadToB2(file, b2Path, (progress) => {
        console.log('Tiến độ tải lên:', progress);
        setUploadProgress(progress);
      });
      console.log('Tải file lên B2 thành công, FileId:', b2FileId);

      const fileData = {
        name: file.name,
        b2FileId: b2FileId,
        type: file.type,
        uploadTime: new Date().toISOString(),
      };
      console.log('Dữ liệu file:', fileData);

      onFileAdded(fileData);
      onClose();
    } catch (error) {
      console.error("Lỗi chi tiết khi tải lên B2:", error);
      if (error.response) {
        console.error("Phản hồi lỗi:", error.response.data);
      }
      setErrorMessage(`Lỗi khi tải file: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white p-5 rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Tải lên B2</h2>
        <input
          type="file"
          onChange={handleFileChange}
          className="mb-4 w-full"
        />
        {errorMessage && <p className="text-red-500 mb-4">{errorMessage}</p>}
        {uploading ? (
          <div className="mb-4">
            <p>Đang tải lên: {Math.round(uploadProgress)}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="mr-2 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition duration-300"
            >
              Hủy
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition duration-300 ${
                (!file || uploading) && "opacity-50 cursor-not-allowed"
              }`}
            >
              Tải lên
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
