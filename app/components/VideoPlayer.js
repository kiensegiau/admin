import React, { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "@videojs/http-streaming";
import "videojs-contrib-quality-levels";
import "videojs-hls-quality-selector";

export default function VideoPlayer({ fileId, onError, autoPlay = false }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);

  useEffect(() => {
    const fetchVideoUrl = async () => {
      try {
        const response = await fetch(fileId);
        if (!response.ok) {
          throw new Error("Không thể tải nội dung playlist");
        }
        setVideoUrl(fileId);
      } catch (error) {
        console.error("Lỗi khi tải URL video:", error);
        onError(new Error("Không thể tải video. Vui lòng thử lại sau."));
      }
    };

    fetchVideoUrl();
  }, [fileId, onError]);

  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;

    if (playerRef.current) {
      playerRef.current.dispose();
    }

    playerRef.current = videojs(videoRef.current, {
      controls: true,
      fluid: true,
      responsive: true,
      aspectRatio: "16:9",
      autoplay: autoPlay,
      html5: {
        hls: {
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
          overrideNative: true,
        },
        vhs: {
          overrideNative: true,
        },
      },
      controlBar: {
        children: [
          "playToggle",
          "volumePanel",
          "currentTimeDisplay",
          "timeDivider",
          "durationDisplay",
          "progressControl",
          "liveDisplay",
          "remainingTimeDisplay",
          "customControlSpacer",
          "playbackRateMenuButton",
          "qualitySelector",
          "fullscreenToggle",
        ],
      },
    });

    playerRef.current.src({
      src: videoUrl,
      type: "application/x-mpegURL",
    });

    playerRef.current.on("error", (error) => {
      console.error("Lỗi trình phát video:", error);
      const errorDetails = playerRef.current.error();
      let errorMessage = "Lỗi khi tải video";
      if (errorDetails) {
        errorMessage = getErrorMessage(errorDetails);
      }
      onError(new Error(errorMessage));
    });

    playerRef.current.hlsQualitySelector({
      displayCurrentQuality: true,
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [videoUrl, onError, autoPlay]);

  return (
    <div data-vjs-player>
      <video ref={videoRef} className="video-js vjs-big-play-centered" />
    </div>
  );
}

function getErrorMessage(errorDetails) {
  switch (errorDetails.code) {
    case 1:
      return "Quá trình tải video bị hủy bỏ";
    case 2:
      return "Lỗi mạng khi tải video";
    case 3:
      return "Lỗi giải mã video";
    case 4:
      return "Video không được hỗ trợ";
    default:
      return `Lỗi khi tải video: ${errorDetails.message}`;
  }
}
