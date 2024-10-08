import { useState, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player';
import Hls from 'hls.js';
import { useRef } from "react";

export default function VideoPlayer({ masterPlaylistContent, baseUrl, onError }) {
  const videoRef = useRef(null);
  const [hls, setHls] = useState(null);

  useEffect(() => {
    if (masterPlaylistContent && baseUrl) {
      const lines = masterPlaylistContent.split('\n');
      const playlists = lines.filter(line => line.includes('.m3u8'));

      if (playlists.length > 0) {
        const selectedPlaylist = playlists[0];
        const originalUrl = selectedPlaylist.startsWith('http') ? selectedPlaylist : new URL(selectedPlaylist, baseUrl).toString();
        const key = `khoa-hoc/${originalUrl.split(process.env.NEXT_PUBLIC_R2_BUCKET_NAME + '/').pop()}`;
        const playlistUrl = `/api/r2-proxy?key=${encodeURIComponent(key)}`;

        if (Hls.isSupported()) {
          const hlsConfig = {
            debug: true,
            xhrSetup: function(xhr, url) {
              const parsedUrl = new URL(url);
              if (parsedUrl.hostname === window.location.hostname) {
                const key = decodeURIComponent(parsedUrl.search.split('key=')[1]);
                xhr.open('GET', `/api/r2-proxy?key=${encodeURIComponent(key)}`, true);
              }
            }
          };
          const hlsInstance = new Hls(hlsConfig);
          hlsInstance.loadSource(playlistUrl);
          hlsInstance.attachMedia(videoRef.current);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            videoRef.current.play().catch(e => console.error("Lỗi khi phát video:", e));
          });
          hlsInstance.on(Hls.Events.ERROR, (event, data) => {
            console.error("Lỗi HLS:", event, data);
            if (data.fatal) {
              switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                  console.error("Lỗi mạng khi tải manifest hoặc fragment.");
                  hlsInstance.startLoad();
                  break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                  console.error("Lỗi media. Thử khôi phục.");
                  hlsInstance.recoverMediaError();
                  break;
                default:
                  console.error("Lỗi không thể khôi phục.");
                  onError(new Error(data.details));
                  break;
              }
            }
          });
          setHls(hlsInstance);
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          videoRef.current.src = playlistUrl;
          videoRef.current.addEventListener('loadedmetadata', () => {
            videoRef.current.play().catch(e => console.error("Lỗi khi phát video:", e));
          });
        }
      }

      return () => {
        if (hls) {
          hls.destroy();
        }
      };
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [masterPlaylistContent, baseUrl, onError]);

  if (!masterPlaylistContent) {
    return <div>Đang tải...</div>;
  }

  return (
    <video
      ref={videoRef}
      controls
      style={{ width: '100%' }}
    />
  );
}