import React, { useState, useCallback, useEffect } from "react";
import { db } from '../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { Spin, Progress } from 'antd';
import { uploadToDrive } from '../utils/driveUpload';
import { uploadToB2 } from '../utils/b2Upload';

export default function B2UploadModal({ onClose, courseId, chapterId, lessonId, courseName, chapterName, lessonName, onFileAdded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ drive: 0, b2: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [isDriveVerified, setIsDriveVerified] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const updateProgress = useCallback((service, progress) => {
    setUploadProgress(prev => ({ ...prev, [service]: progress }));
  }, []);

  const checkDriveVerification = useCallback(async () => {
    const accessToken = document.cookie.split('; ').find(row => row.startsWith('googleDriveAccessToken='))?.split('=')[1];
    if (accessToken) {
      try {
        const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (response.ok) {
          setIsDriveVerified(true);
        } else {
          setIsDriveVerified(false);
        }
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
    if (!file) return;
    setUploading(true);
    setErrorMessage('');
    try {
      const accessToken = document.cookie.split('; ').find(row => row.startsWith('googleDriveAccessToken='))?.split('=')[1];
      if (!accessToken) {
        throw new Error('Không có access token. Vui lòng kết nối với Google Drive.');
      }

      const drivePath = `/courses/${courseName}/${chapterName}/${lessonName}`;
      const [driveResult, b2FileId] = await Promise.all([
        uploadToDrive(file, accessToken, (progress) => updateProgress('drive', progress), drivePath),
        uploadToB2(file, courseName, chapterName, lessonName, (progress) => updateProgress('b2', progress))
      ]);

      const fileData = {
        name: file.name,
        driveUrl: driveResult.webViewLink,
        b2FileId: b2FileId,
        type: file.type,
        uploadTime: new Date().toISOString()
      };

      const courseRef = doc(db, 'courses', courseId);
      const courseDoc = await getDoc(courseRef);
      const courseData = courseDoc.data();

      if (!courseData) {
        throw new Error('Không tìm thấy dữ liệu khóa học');
      }

      const updatedChapters = courseData.chapters.map(chapter => {
        if (chapter.id === chapterId) {
          const updatedLessons = chapter.lessons.map(lesson => {
            if (lesson.id === lessonId) {
              return {
                ...lesson,
                files: [...(lesson.files || []), fileData]
              };
            }
            return lesson;
          });
          return { ...chapter, lessons: updatedLessons };
        }
        return chapter;
      });

      await updateDoc(courseRef, { chapters: updatedChapters });

      onFileAdded(fileData);
      onClose();
    } catch (error) {
      console.error('Lỗi chi tiết:', error);
      setErrorMessage(`Lỗi khi tải file: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center" onClick={onClose}>
      <div className="bg-white p-5 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Tải lên tài liệu</h2>
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
            <input type="file" onChange={handleFileChange} className="mb-4 w-full" />
            {errorMessage && <p className="text-red-500 mb-4">{errorMessage}</p>}
            {uploading ? (
              <div className="mb-4">
                <Spin spinning={uploading} tip="Đang tải lên...">
                  <div className="mb-2">
                    <p>Google Drive:</p>
                    <Progress percent={Math.round(uploadProgress.drive)} status="active" />
                  </div>
                  <div>
                    <p>B2:</p>
                    <Progress percent={Math.round(uploadProgress.b2)} status="active" />
                  </div>
                </Spin>
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
                    (!file || uploading) && 'opacity-50 cursor-not-allowed'
                  }`}
                >
                  Tải lên
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}