import { useState } from "react";
import { storage, db } from '.././firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, setDoc, getDoc } from 'firebase/firestore';
import LoadingSpinner from './LoadingSpinner';
import { google } from 'googleapis';
import { getSession } from 'next-auth/react';

export default function AddFileModal({ onClose, lessonId, onFileAdded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      // Upload to Firebase Storage
      const storageRef = ref(storage, `lessons/${lessonId}/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Lỗi khi tải file lên Firebase:', error);
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // Upload to Google Drive
          const session = await getSession();
          let tokens = session.googleTokens;

          if (isTokenExpired(tokens)) {
            const response = await fetch('/api/auth/refresh-token');
            if (response.ok) {
              const newSession = await getSession();
              tokens = newSession.googleTokens;
            } else {
              throw new Error('Failed to refresh token');
            }
          }

          // Import dynamically
          const { google } = await import('googleapis');

          // Sử dụng Google Drive API
          const oauth2Client = new google.auth.OAuth2();
          oauth2Client.setCredentials(tokens);
          const drive = google.drive({ version: 'v3', auth: oauth2Client });

          const fileMetadata = {
            name: file.name,
          };

          const media = {
            mimeType: file.type,
            body: file,
          };

          const driveResponse = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink',
          });

          const fileData = {
            name: file.name,
            firebaseUrl: downloadURL,
            driveUrl: driveResponse.data.webViewLink,
            type: file.type,
            uploadTime: new Date().toISOString()
          };

          const lessonRef = doc(db, 'lessons', lessonId);
          const lessonSnap = await getDoc(lessonRef);

          if (!lessonSnap.exists()) {
            // Tạo document mới nếu chưa tồn tại
            await setDoc(lessonRef, { files: [fileData] });
          } else {
            // Cập nhật document nếu đã tồn tại
            await updateDoc(lessonRef, {
              files: arrayUnion(fileData)
            });
          }

          onFileAdded();
          onClose();
          setUploading(false);
        }
      );
    } catch (error) {
      console.error('Lỗi chi tiết:', error.code, error.message);
      // Hiển thị thông báo lỗi cho người dùng
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center" onClick={onClose}>
      <div className="bg-white p-5 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Thêm tài liệu</h2>
        <input type="file" onChange={handleFileChange} className="mb-4 w-full" />
        {uploading ? (
          <div className="mb-4">
            <LoadingSpinner />
            <p className="text-center mt-2">Đang tải lên: {uploadProgress.toFixed(0)}%</p>
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
      </div>
    </div>
  );
}
