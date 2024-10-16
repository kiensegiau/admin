import React, { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import "@videojs/http-streaming";

export default function VideoPlayer({ fileId, onError }) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [videoData, setVideoData] = useState(null);

  useEffect(() => {
    const fetchVideoData = async () => {
      console.log('Đang tải dữ liệu video cho fileId:', fileId);
      
      try {
        const response = await fetch(fileId);
        if (!response.ok) {
          throw new Error(`Không thể tải thông tin video. Mã trạng thái: ${response.status}`);
        }
        const xmlData = await response.text();
        console.log('Dữ liệu XML nhận được:', xmlData);
        
        // Phân tích XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlData, "text/xml");
        const errorCode = xmlDoc.getElementsByTagName("Code")[0]?.textContent;
        const errorMessage = xmlDoc.getElementsByTagName("Message")[0]?.textContent;
        
        if (errorCode === "NoSuchKey") {
          throw new Error(`File video không tồn tại hoặc đã bị xóa. Vui lòng kiểm tra lại.`);
        } else if (errorCode && errorMessage) {
          throw new Error(`Lỗi từ server: ${errorCode} - ${errorMessage}`);
        }
        
        // Nếu không có lỗi, xử lý dữ liệu XML ở đây
        // Ví dụ: Lấy URL video từ XML (giả sử có thẻ VideoUrl)
        const videoUrl = xmlDoc.getElementsByTagName("VideoUrl")[0]?.textContent;
        if (!videoUrl) {
          throw new Error("Không tìm thấy URL video trong dữ liệu XML");
        }
        
        setVideoData({ r2FileId: videoUrl, type: "video/mp4" }); // Giả sử type là mp4
      } catch (error) {
        console.error('Lỗi chi tiết khi tải thông tin video:', error);
        onError(error);
      }
    };

    fetchVideoData();
  }, [fileId, onError]);

  useEffect(() => {
    if (!videoRef.current || !videoData) return;

    const options = {
      controls: true,
      fluid: true,
      responsive: true,
      html5: {
        hls: {
          overrideNative: true,
          enableLowInitialPlaylist: true,
          smoothQualityChange: true,
        },
        vhs: {
          overrideNative: true
        }
      },
      liveui: false,
      liveTracker: false,
    };

    playerRef.current = videojs(videoRef.current, options);

    playerRef.current.src({
      src: videoData.r2FileId,
      type: videoData.type
    });

    playerRef.current.on('loadedmetadata', () => {
      playerRef.current.play();
    });

    playerRef.current.on('error', (error) => {
      console.error('Lỗi trình phát video:', error);
      const errorDetails = playerRef.current.error();
      let errorMessage = 'Lỗi khi phát video';
      if (errorDetails) {
        errorMessage += `: ${errorDetails.message}`;
      }
      onError(new Error(errorMessage));
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
      }
    };
  }, [videoData, onError]);

  return (
    <div data-vjs-player>
      <video ref={videoRef} className="video-js vjs-big-play-centered" />
    </div>
  );
}
