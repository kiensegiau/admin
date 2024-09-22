import React from 'react';

export default function FileViewModal({ file, onClose }) {
  const openLink = (url) => {
    if (url) {
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white p-6 rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-semibold mb-4">{file.name}</h2>
        <div className="mb-4">
          <p className="text-gray-600">Loại file: {file.type}</p>
          <p className="text-gray-600">Thời gian tải lên: {new Date(file.uploadTime).toLocaleString()}</p>
        </div>
        <div className="flex justify-center space-x-4 mb-4">
          {file.driveUrl && (
            <button
              onClick={() => openLink(file.driveUrl)}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition duration-300"
            >
              Mở trên Google Drive
            </button>
          )}
          {file.firebaseUrl && (
            <button
              onClick={() => openLink(file.firebaseUrl)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded transition duration-300"
            >
              Mở trên Firebase
            </button>
          )}
        </div>
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