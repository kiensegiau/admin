import React, { useState, useEffect, useCallback } from "react";
import VideoPlayer from "./VideoPlayer";

import useB2Auth from '../hooks/useB2Auth';

const VideoModal = ({ file, onClose }) => {
  const [videoUrl, setVideoUrl] = useState(null);
  const [m3u8Content, setM3u8Content] = useState(null);
  const b2 = useB2Auth();

  const processM3u8Content = useCallback(async (content) => {
    if (!b2) return;
    try {
      const lines = content.split('\n');
      const tsFileIds = lines.filter(line => line.trim() && !line.startsWith('#')).map(line => line.trim());
      
      const response = await fetch('/api/b2-get-download-urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileIds: tsFileIds }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const authenticatedUrls = await response.json();

      const updatedContent = lines.map(line => {
        if (line.trim() && !line.startsWith('#')) {
          const fileId = line.trim();
          return authenticatedUrls[fileId] || line;
        }
        return line;
      }).join('\n');

      const blob = new Blob([updatedContent], { type: 'application/x-mpegURL' });
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (error) {
      console.error("Lỗi khi xử lý nội dung m3u8:", error);
      toast.error("Không thể tải video. Vui lòng thử lại sau.");
    }
  }, [b2]);

  useEffect(() => {
    const fetchM3u8Content = async (retryCount = 0) => {
      if (file.b2FileId) {
        try {
          const response = await fetch('/api/b2-get-download-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ fileId: file.b2FileId }),
          });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          if (data.downloadUrl) {
            const m3u8Response = await fetch(data.downloadUrl);
            const content = await m3u8Response.text();
            setM3u8Content(content);
            processM3u8Content(content);
          } else {
            throw new Error('Không thể lấy URL xác thực cho file m3u8');
          }
        } catch (error) {
          console.error('Lỗi khi lấy nội dung m3u8:', error);
          if (retryCount < 3) {
            console.log(`Đang thử lại lần ${retryCount + 1}...`);
            setTimeout(() => fetchM3u8Content(retryCount + 1), 1000 * (retryCount + 1));
          } else {
            toast.error("Không thể tải video sau nhiều lần thử. Vui lòng thử lại sau.");
          }
        }
      } else if (file.url) {
        setVideoUrl(file.url);
      }
    };

    fetchM3u8Content();
  }, [file, processM3u8Content]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-3xl w-full">
        <h2 className="text-2xl font-bold mb-4">{file.name}</h2>
        {videoUrl ? (
          <VideoPlayer src={videoUrl} />
        ) : (
          <p>Đang tải video...</p>
        )}
        <div className="mt-4">
          <p>
            <strong>Loại file:</strong> {file.type}
          </p>
          <p>
            <strong>Thời gian tải lên:</strong>{" "}
            {new Date(file.uploadTime).toLocaleString()}
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-4 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition duration-300"
        >
          Đóng
        </button>
      </div>
    </div>
  );
};

export default VideoModal;
