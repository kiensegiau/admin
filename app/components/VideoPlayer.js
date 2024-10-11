import React, { useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import '@videojs/http-streaming';
import 'videojs-contrib-quality-levels'


export default function VideoPlayer({ fileId, onError, autoPlay = false }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [qualityLevels, setQualityLevels] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(null);

  useEffect(() => {
    console.log('VideoPlayer useEffect triggered');
    console.log('fileId:', fileId);

    const fetchVideoUrl = async () => {
      try {
        const response = await fetch(fileId);
        if (!response.ok) {
          throw new Error('Không thể tải nội dung playlist');
        }
        const playlistContent = await response.text();
        setVideoUrl(fileId);
      } catch (error) {
        console.error('Lỗi khi tải URL video:', error);
        onError(new Error('Không thể tải video. Vui lòng thử lại sau.'));
      }
    };

    fetchVideoUrl();
  }, [fileId, onError]);

  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;

    if (playerRef.current) {
      console.log('Disposing existing player');
      playerRef.current.dispose();
    }

    console.log('Initializing new player');
    playerRef.current = videojs(videoRef.current, {
      controls: true,
      fluid: true,
      responsive: true,
      aspectRatio: '16:9',
      autoplay: autoPlay,
      html5: {
        hls: {
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
          overrideNative: true,
        },
        vhs: {
          overrideNative: true
        }
      },
      controlBar: {
        children: [
          'playToggle',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'liveDisplay',
          'remainingTimeDisplay',
          'customControlSpacer',
          'playbackRateMenuButton',
          'qualitySelector',
          'fullscreenToggle'
        ]
      }
 
    });

    playerRef.current.qualityLevels();

    console.log('Setting source:', videoUrl);
    playerRef.current.src({
      src: videoUrl,
      type: 'application/x-mpegURL'
    });

    playerRef.current.on('loadedmetadata', () => {
      const levels = playerRef.current.qualityLevels();
      const availableLevels = [];
      for (let i = 0; i < levels.length; i++) {
        availableLevels.push({
          id: i,
          label: `${levels[i].width}x${levels[i].height}`,
          width: levels[i].width,
          height: levels[i].height
        });
      }
      setQualityLevels(availableLevels);
      setCurrentQuality(availableLevels[0]); // Đặt chất lượng mặc định là cao nhất
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
  }, [videoUrl, onError, autoPlay]);

  console.log('VideoPlayer render, videoRef:', videoRef.current);

  return (
    <div data-vjs-player>
      <video ref={videoRef} className="video-js vjs-big-play-centered" />
      {qualityLevels.length > 0 && (
        <div className="vjs-quality-selector vjs-menu-button vjs-menu-button-popup vjs-control vjs-button">
          <button className="vjs-menu-button" type="button" aria-haspopup="true" aria-expanded="false">
            <span className="vjs-icon-placeholder" aria-hidden="true"></span>
            <span className="vjs-control-text" aria-live="polite">Chất lượng</span>
          </button>
          <div className="vjs-menu">
            <ul className="vjs-menu-content" role="menu">
              {qualityLevels.map((level) => (
                <li
                  key={level.id}
                  className={`vjs-menu-item ${currentQuality && currentQuality.id === level.id ? 'vjs-selected' : ''}`}
                  role="menuitemradio"
                  aria-checked={currentQuality && currentQuality.id === level.id ? 'true' : 'false'}
                  onClick={() => changeQuality(level.id)}
                >
                  <span className="vjs-menu-item-text">{level.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}