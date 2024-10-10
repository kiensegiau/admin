import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import '@videojs/http-streaming';

export default function VideoPlayer({ fileId, onError }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    if (!playerRef.current) {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      playerRef.current = videojs(videoElement, {
        controls: true,
        fluid: true,
        html5: {
          hls: {
            enableLowInitialPlaylist: true,
            smoothQualityChange: true,
            overrideNative: true,
          },
        },
      });

      playerRef.current.src({
        src: `/api/r2-proxy?key=${encodeURIComponent(fileId)}`,
        type: 'application/x-mpegURL',
      });

      playerRef.current.on('error', (error) => {
        console.error('Lỗi trình phát video:', error);
        onError(new Error('Lỗi khi tải video'));
      });

      playerRef.current.qualityLevels().on('change', () => {
        const qualityLevels = playerRef.current.qualityLevels();
        const currentQuality = qualityLevels[qualityLevels.selectedIndex];
        console.log('Chất lượng hiện tại:', currentQuality ? `${currentQuality.height}p` : 'Auto');
      });
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [fileId, onError]);

  return (
    <div data-vjs-player>
      <video ref={videoRef} className="video-js vjs-big-play-centered" />
    </div>
  );
}