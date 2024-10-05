import React from "react";
import VideoPlayer from "./VideoPlayer";

const VideoModal = ({ file, onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg max-w-3xl w-full">
        <h2 className="text-2xl font-bold mb-4">{file.name}</h2>
        <VideoPlayer src={file.url} />
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
