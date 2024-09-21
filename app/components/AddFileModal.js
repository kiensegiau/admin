import { useState } from "react";
import { storage, db } from '.././firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, arrayUnion, setDoc, getDoc } from 'firebase/firestore';
import LoadingSpinner from './LoadingSpinner';

const normalizeFileName = (fileName) => {
  return encodeURIComponent(fileName.trim());
};

export default function AddFileModal({ onClose, courseId, chapterId, lessonId, courseName, chapterName, lessonName, onFileAdded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  if (!courseId || !chapterId || !lessonId) {
    console.error('Thiếu thông tin cần thiết để thêm file');
    return null; // Hoặc hiển thị thông báo lỗi
  }

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
     
      const storageRef = ref(storage, `/courses/${courseName}/${chapterName}/${lessonName}/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Lỗi khi tải file lên Firebase:', error);
          setErrorMessage(`Lỗi khi tải file lên: ${error.message}`);
          setUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          const fileData = {
            name: file.name,
            url: downloadURL,
            type: file.type,
            uploadTime: new Date().toISOString()
          };

          const lessonRef = doc(db, 'courses', courseId, 'chapters', chapterId, 'lessons', lessonId);
          const lessonSnap = await getDoc(lessonRef);

          if (!lessonSnap.exists()) {
            await setDoc(lessonRef, { files: [fileData] });
          } else {
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
      console.error('Lỗi chi tiết:', error);
      setErrorMessage(`Lỗi khi tải file: ${error.message}`);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center" onClick={onClose}>
      <div className="bg-white p-5 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Thêm tài liệu</h2>
        <input type="file" onChange={handleFileChange} className="mb-4 w-full" />
        {errorMessage && <p className="text-red-500 mb-4">{errorMessage}</p>}
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
