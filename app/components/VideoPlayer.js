import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';

export default function VideoPlayer({ fileId, onError }) {
  const videoRef = useRef(null);
  const [hls, setHls] = useState(null);

  useEffect(() => {
    if (fileId) {
      console.log('Đang gọi API để lấy URL đã ký cho fileId:', fileId);
      const fetchSignedUrl = async () => {
        try {
          const response = await fetch(`/api/r2-proxy?key=${encodeURIComponent(fileId)}`);
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (data.signedUrl) {
              console.log('Signed URL:', data.signedUrl);
              loadVideo(data.signedUrl);
            } else {
              throw new Error('Failed to get signed URL');
            }
          } else {
            const text = await response.text();
            console.log('Nội dung m3u8:', text);
            loadVideo(`/api/r2-proxy?key=${encodeURIComponent(fileId)}`);
          }
        } catch (error) {
          console.error('Error fetching signed URL:', error);
          onError(error);
        }
      };

      fetchSignedUrl();
    }

    return () => {
      if (hls) {
        console.log('Hủy instance HLS');
        hls.destroy();
      }
    };
  }, [fileId, onError]);

  const loadVideo = (url) => {
    console.log('Bắt đầu tải video với URL:', url);
    if (Hls.isSupported()) {
      console.log('HLS được hỗ trợ');
      const hlsConfig = {
        debug: true,  // Bật chế độ debug
        xhrSetup: function(xhr, xhrUrl) {
          console.log('XHR setup cho URL:', xhrUrl);
          xhr.open('GET', xhrUrl, true);
        }
      };
      const hlsInstance = new Hls(hlsConfig);
      hlsInstance.loadSource(url);
      hlsInstance.attachMedia(videoRef.current);
      hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('Manifest đã được phân tích');
        videoRef.current.play().catch(e => console.error("Lỗi khi phát video:", e));
      });
      hlsInstance.on(Hls.Events.LEVEL_LOADED, (event, data) => {
        console.log('Level loaded:', data);
        if (data.details.live === false) {
          console.log('Video không phải là live stream');
        }
      });
      hlsInstance.on(Hls.Events.ERROR, (event, data) => {
        console.error('Chi tiết lỗi HLS:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.error('Lỗi mạng, đang thử tải lại...');
              hlsInstance.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.error('Lỗi media, đang thử khôi phục...');
              hlsInstance.recoverMediaError();
              break;
            default:
              console.error('Lỗi không thể khôi phục');
              hlsInstance.destroy();
              break;
          }
        }
      });
      setHls(hlsInstance);
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('HLS không được hỗ trợ, sử dụng native playback');
      videoRef.current.src = url;
      videoRef.current.addEventListener('loadedmetadata', () => {
        videoRef.current.play().catch(e => console.error("Lỗi khi phát video:", e));
      });
    }
  };

  if (!fileId) {
    console.log('Không có fileId');
    return <div>Đang tải...</div>;
  }

  return (
    <video
      ref={videoRef}
      controls
      className="absolute top-0 left-0 w-full h-full object-contain"
      onError={(e) => {
        console.error('Lỗi video element:', e);
        onError(new Error('Lỗi khi tải video'));
      }}
    />
  );
}

const processUrl = (url, baseUrl) => {
  try {
    let fullUrl;
    if (url.startsWith('http')) {
      fullUrl = new URL(url);
    } else if (url.startsWith('/')) {
      fullUrl = new URL(url, window.location.origin);
    } else {
      fullUrl = new URL(url, baseUrl);
    }
    return `/api/r2-proxy?key=${encodeURIComponent(fullUrl.pathname.slice(1))}`;
  } catch (error) {
    console.error('Lỗi khi xử lý URL:', error);
    return url;
  }
};