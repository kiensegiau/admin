'use client';
import { useState, useEffect, useRef } from 'react';

export default function VideoPlayer({ videoId }) {
  const [status, setStatus] = useState('loading');
  const videoRef = useRef(null);

  useEffect(() => {
    let pollInterval;

    async function checkVideoStatus() {
      try {
        const response = await fetch(`/api/proxy/files?id=${videoId}`);
        
        if (response.status === 200) {
          // Video ready
          setStatus('ready');
          clearInterval(pollInterval);
          videoRef.current.src = `/api/proxy/files?id=${videoId}`;
        } else if (response.status === 202) {
          // Still processing
          setStatus('processing');
        } else {
          throw new Error('Failed to load video');
        }
      } catch (error) {
        console.error('Error:', error);
        setStatus('error');
        clearInterval(pollInterval);
      }
    }

    // Poll cho đến khi video ready
    checkVideoStatus();
    pollInterval = setInterval(checkVideoStatus, 5000);

    return () => clearInterval(pollInterval);
  }, [videoId]);

  return (
    <div className="relative">
      {status === 'processing' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <p className="text-white">Video đang được xử lý...</p>
        </div>
      )}
      <video
        ref={videoRef}
        controls
        className="w-full"
        style={{ display: status === 'ready' ? 'block' : 'none' }}
      />
    </div>
  );
} 