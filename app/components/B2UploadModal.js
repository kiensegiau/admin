import React, { useState, useCallback } from "react";
import { Spin, Progress } from 'antd';
import { uploadToB2 } from '../utils/b2Upload';
import { segmentVideo } from '../utils/videoProcessing';

export default function B2UploadModal({ onClose, courseId, chapterId, lessonId, courseName, chapterName, lessonName, onFileAdded }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadProgress, setUploadProgress] = useState({
    processing: 0,
    uploading: 0,
    segments: []
  });
  const [logs, setLogs] = useState([]);

  const updateProgress = (stage, progress, segmentIndex = null) => {
    setUploadProgress(prev => {
      if (stage === 'processing') {
        return { ...prev, processing: progress };
      } else if (stage === 'uploading') {
        if (segmentIndex !== null) {
          const newSegments = [...prev.segments];
          newSegments[segmentIndex] = progress;
          return { ...prev, segments: newSegments };
        } else {
          return { ...prev, uploading: progress };
        }
      }
      return prev;
    });
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setErrorMessage('');
    setUploadProgress({ processing: 0, uploading: 0, segments: [] });
    setLogs([]);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('courseName', courseName);
    formData.append('chapterName', chapterName);
    formData.append('lessonName', lessonName);

    const eventSource = new EventSource(`/api/upload-and-segment-video?filename=${encodeURIComponent(file.name)}`);

    eventSource.onmessage = (event) => {
      const rawData = event.data;
      setLogs(prevLogs => [...prevLogs, rawData]);
      
      const jsonObjects = rawData.split('\n\n').filter(Boolean);
      
      jsonObjects.forEach(jsonStr => {
        try {
          const jsonData = JSON.parse(jsonStr);
          if (jsonData.stage === 'processing') {
            updateProgress('processing', jsonData.progress);
          } else if (jsonData.stage === 'uploading') {
            updateProgress('uploading', jsonData.progress);
          } else if (jsonData.stage === 'segment') {
            updateProgress('uploading', jsonData.progress, jsonData.segmentIndex);
          } else if (jsonData.stage === 'complete') {
            eventSource.close();
          } else if (jsonData.stage === 'error') {
            setErrorMessage(`Lỗi từ server: ${jsonData.message}`);
            eventSource.close();
          }
        } catch (error) {
          console.error('Lỗi khi xử lý sự kiện:', error, 'Dữ liệu gốc:', jsonStr);
          setLogs(prevLogs => [...prevLogs, `Lỗi xử lý: ${error.message}`]);
        }
      });
    };

    eventSource.onerror = () => {
      setErrorMessage('Lỗi khi nhận cập nhật tiến trình');
      setUploading(false);
      setLogs(prevLogs => [...prevLogs, 'Lỗi kết nối EventSource']);
    };

    try {
      const response = await fetch('/api/upload-and-segment-video', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Lỗi xử lý video: ${errorData.error}`);
      }

      const result = await response.json();
      onFileAdded(result);
      onClose();
    } catch (error) {
      setErrorMessage(`Lỗi khi tải file: ${error.message}`);
      setLogs(prevLogs => [...prevLogs, `Lỗi: ${error.message}`]);
    } finally {
      setUploading(false);
      eventSource.close();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full flex items-center justify-center">
      <div className="bg-white p-5 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Tải lên video</h2>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} className="mb-4 w-full" accept="video/*" />
        {errorMessage && <p className="text-red-500 mb-4">{errorMessage}</p>}
        {uploading ? (
          <div className="mb-4">
            <h3 className="font-bold mb-2">Logs:</h3>
            <div className="bg-gray-100 p-2 rounded h-40 overflow-y-auto">
              {logs.map((log, index) => (
                <p key={index} className="text-sm whitespace-pre-wrap">{log}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <button onClick={onClose} className="mr-2 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300">
              Hủy
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className={`px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 ${(!file || uploading) && 'opacity-50 cursor-not-allowed'}`}
            >
              Tải lên
            </button>
          </div>
        )}
      </div>
    </div>
  );
}