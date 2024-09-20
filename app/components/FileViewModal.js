import React, { useState } from 'react';
import LoadingSpinner from './LoadingSpinner';

export default function FileViewModal({ file, onClose }) {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoad = () => {
    setIsLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white p-6 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-semibold mb-4">{file.name}</h2>
        <div className="mb-4 relative" style={{ minHeight: '200px' }}>
          {isLoading && <LoadingSpinner />}
          {file.type.startsWith('image/') && (
            <img src={file.url} alt={file.name} className="max-w-full h-auto" onLoad={handleLoad} />
          )}
          {file.type.startsWith('video/') && (
            <video src={file.url} controls className="max-w-full h-auto" onLoadedData={handleLoad} />
          )}
          {file.type === 'application/pdf' && (
            <iframe src={file.url} className="w-full h-[70vh]" onLoad={handleLoad} />
          )}
          {!file.type.startsWith('image/') && !file.type.startsWith('video/') && file.type !== 'application/pdf' && (
            <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline" onClick={handleLoad}>
              Tải xuống file
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}