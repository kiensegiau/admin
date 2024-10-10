import React, { useState, useEffect } from "react";
import VideoPlayer from "./VideoPlayer";

const VideoModal = ({ fileId, fileName, onClose }) => {
  const [error, setError] = useState(null);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg w-full max-w-3xl">
        <h2 className="text-lg font-semibold mb-2">{fileName}</h2>
        <div className="relative" style={{ paddingTop: '56.25%' }}>
          <VideoPlayer
            fileId={fileId}
            onError={(error) => {
              console.error('Video playback error:', error);
              setError(error.message);
            }}
          />
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