import React from "react";
import VideoPlayer from "./VideoPlayer";

const VideoModal = ({ fileId, fileName, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <h2 className="text-lg font-semibold p-4 border-b">{fileName}</h2>
        <div className="flex-grow overflow-auto">
          <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
            <div className="absolute inset-0">
              <VideoPlayer
                fileId={fileId}
                onError={(error) => {
                  console.error("Video playback error:", error);
                }}
                autoPlay={true}
              />
            </div>
          </div>
        </div>
        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoModal;
