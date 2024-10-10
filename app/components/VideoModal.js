import React, { useState, useEffect } from "react";
import VideoPlayer from "./VideoPlayer";

const VideoModal = ({ fileId, fileName, onClose }) => {
  const [error, setError] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  useEffect(() => {
    const fetchVideoUrl = async () => {
      try {
        const response = await fetch(fileId);
        if (!response.ok) {
          throw new Error('Không thể tải nội dung playlist');
        }
        const playlistContent = await response.text();
        const masterPlaylistUrl = new URL(fileId, window.location.origin).href;
        setVideoUrl(masterPlaylistUrl);
      } catch (error) {
        console.error('Lỗi khi tải URL video:', error);
        setError('Không thể tải video. Vui lòng thử lại sau.');
      }
    };

    fetchVideoUrl();
  }, [fileId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg w-full max-w-3xl">
        <h2 className="text-lg font-semibold mb-2">{fileName}</h2>
        <div className="relative" style={{ paddingTop: "56.25%", height: 0 }}>
          <div className="absolute inset-0">
            {fileId && (
              <VideoPlayer
                fileId={videoUrl}
                onError={(error) => {
                  console.error("Video playback error:", error);
                  setError(error.message);
                }}
              />
            )}
          </div>
        </div>
        {error && <div className="text-red-500 mt-2 text-sm">{error}</div>}
        <button
          onClick={onClose}
          className="mt-3 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
        >
          Đóng
        </button>
      </div>
    </div>
  );
};

export default VideoModal;