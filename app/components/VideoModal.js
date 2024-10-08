import React, { useState, useEffect, useCallback } from "react";
import VideoPlayer from "./VideoPlayer";

import useB2Auth from '../hooks/useB2Auth';
import { toast } from 'sonner';

const VideoModal = ({ fileId, fileName, onClose }) => {
  const [masterPlaylistContent, setMasterPlaylistContent] = useState(null);
  const [error, setError] = useState(null);
  const baseUrl = `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.NEXT_PUBLIC_R2_BUCKET_NAME}/`;

  useEffect(() => {
    const fetchMasterPlaylist = async () => {
      try {
        const response = await fetch(`/api/get-master-playlist?fileId=${encodeURIComponent(fileId)}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.content) {
          console.log("Master playlist content:", data.content);
          setMasterPlaylistContent(data.content);
        } else {
          throw new Error('Failed to get master playlist content');
        }
      } catch (error) {
        console.error('Error fetching master playlist:', error);
        setError(`Error fetching master playlist: ${error.message}`);
      }
    };

    fetchMasterPlaylist();
  }, [fileId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-4 rounded-lg w-full max-w-4xl">
        <h2 className="text-xl font-bold mb-4">{fileName}</h2>
        {masterPlaylistContent ? (
          <VideoPlayer
            masterPlaylistContent={masterPlaylistContent}
            baseUrl={baseUrl}
            onError={(error) => {
              console.error('Video playback error:', error);
              setError(error.message);
            }}
          />
        ) : (
          <div>Đang tải...</div>
        )}
        {error && <div className="text-red-500 mt-2">{error}</div>}
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Đóng
        </button>
      </div>
    </div>
  );
};

export default VideoModal;