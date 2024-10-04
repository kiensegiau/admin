import React, { useState, useEffect } from 'react';
import ReactPlayer from 'react-player';

export default function FileViewModal({ file, onClose }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  useEffect(() => {
    if (file.b2FileId && file.type.startsWith('video/')) {
      fetchVideoUrl();
    }
  }, [file]);

  const fetchVideoUrl = async () => {
    try {
      console.log('Đang gọi API để lấy URL video...');
      console.log('fileId:', file.b2FileId);
      const response = await fetch('/api/b2-get-download-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId: file.b2FileId }),
      });
      console.log('Phản hồi từ API:', response);
      const data = await response.json();
      console.log('Dữ liệu nhận được:', data);
      if (data.downloadUrl) {
        console.log('URL video đã được set:', data.downloadUrl);
        setVideoUrl(data.downloadUrl);
      } else if (data.error) {
        console.error('Lỗi từ API:', data.error);
        setErrorMessage(data.error);
      } else {
        console.error('Không có URL tải xuống trong dữ liệu phản hồi');
        setErrorMessage('Không thể lấy URL video');
      }
    } catch (error) {
      console.error('Lỗi khi lấy URL video:', error);
      setErrorMessage('Lỗi khi lấy URL video');
    }
  };

  const openLink = async (url, isB2) => {
    console.log('openLink được gọi với URL:', url, 'và isB2:', isB2);
    if (url) {
      if (isB2) {
        try {
          console.log('Đang tải xuống file từ B2...');
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          console.log('Phản hồi từ B2:', response);
          const blob = await response.blob();
          console.log('Blob đã được tạo:', blob);
          const downloadUrl = window.URL.createObjectURL(blob);
          console.log('URL tải xuống đã được tạo:', downloadUrl);
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = file.name;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          console.log('File đã được tải xuống');
        } catch (error) {
          console.error('Lỗi khi tải xuống file từ B2:', error);
          setErrorMessage(`Lỗi khi tải xuống file: ${error.message}`);
        }
      } else {
        console.log('Mở URL trong tab mới:', url);
        window.open(url, '_blank');
      }
    } else {
      console.error('Không có URL để mở hoặc tải xuống');
      setErrorMessage('Không có URL để mở hoặc tải xuống');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white p-6 rounded-lg max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-semibold mb-4">{file.name}</h2>
        <div className="mb-4">
          <p className="text-gray-600">Loại file: {file.type}</p>
          <p className="text-gray-600">Thời gian tải lên: {new Date(file.uploadTime).toLocaleString()}</p>
        </div>
        {errorMessage && (
          <div className="text-red-500 mb-4">
            {errorMessage}
          </div>
        )}
        {file.type.startsWith('video/') && (
          <div className="mb-4">
            {videoUrl ? (
              <ReactPlayer 
                url={videoUrl} 
                controls 
               
                onError={(e) => {
                  console.error('Lỗi khi tải video:', e);
                  setErrorMessage('Không thể tải video. Vui lòng thử lại sau.');
                }}
              />
            ) : (
              <div className="text-center py-4">
                <p>Đang tải video...</p>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-center space-x-4 mb-4">
          {file.driveUrl && (
            <button
              onClick={() => openLink(file.driveUrl)}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-300"
            >
              Mở trên Google Drive
            </button>
          )}
          {file.b2FileId && (
            <button
              onClick={() => {
                console.log('Nút Tải xuống từ B2 được nhấn');
                console.log('videoUrl hiện tại:', videoUrl);
                if (videoUrl) {
                  openLink(videoUrl, true);
                } else {
                  console.log('videoUrl là null, đang gọi lại fetchVideoUrl');
                  fetchVideoUrl();
                }
              }}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition duration-300"
            >
              Tải xuống từ B2
            </button>
          )}
        </div>
        {errorMessage && (
          <button
            onClick={() => {
              setErrorMessage(null);
              fetchVideoUrl();
            }}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded transition duration-300"
          >
            Tải lại video
          </button>
        )}
        <button
          onClick={onClose}
          className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded transition duration-300"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}