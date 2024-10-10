import React, { useEffect, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export default function VideoPlayer({ fileId, onError }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    console.log('VideoPlayer useEffect triggered');
    console.log('fileId:', fileId);
    
    if (!videoRef.current) {
      console.log('videoRef.current is null');
      return;
    }

    if (playerRef.current) {
      console.log('Disposing existing player');
      playerRef.current.dispose();
    }

    console.log('Initializing new player');
    playerRef.current = videojs(videoRef.current, {
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

    console.log('Setting source:', fileId);
    playerRef.current.src({
      src: fileId,
      type: 'application/x-mpegURL'
    });

    playerRef.current.on('error', (error) => {
      console.error('Lỗi trình phát video:', error);
      const errorDetails = playerRef.current.error();
      let errorMessage = 'Lỗi khi tải video';
      if (errorDetails) {
        errorMessage += `: ${errorDetails.message}`;
      }
      onError(new Error(errorMessage));
    });

    return () => {
      if (playerRef.current) {
        console.log('Cleaning up player');
        playerRef.current.dispose();
      }
    };
  }, [fileId, onError]);

  console.log('VideoPlayer render, videoRef:', videoRef.current);

  return (
    <div data-vjs-player>
      <video ref={videoRef} className="video-js vjs-big-play-centered" />
    </div>
  );
}