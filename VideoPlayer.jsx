import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useControlsVisibility } from "../hooks/useControlsVisibility";
import { PreviousIcon, NextIcon } from "./icons/NavigationIcons";

export default function VideoPlayer({
  fileId,
  onEnded,
  onTimeUpdate,
  onNext,
  onPrevious,
  autoPlay = true,
}) {
  const videoRef = useRef(null);
  const { isControlsVisible, handleMouseMove, handleMouseLeave } =
    useControlsVisibility();
  const [videoMetadata, setVideoMetadata] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const videoUrl = useMemo(() => {
    if (!fileId) {
      console.warn("No fileId provided");
      return "";
    }

    if (fileId.includes("/api/proxy/files?id=")) {
      console.log("FileId already contains API path");
      return `${process.env.NEXT_PUBLIC_API_URL}${fileId}`;
    }

    if (fileId.startsWith("http")) {
      console.log("FileId is full URL:", fileId);
      return fileId;
    }

    const url = `${process.env.NEXT_PUBLIC_API_URL}/api/proxy/files?id=${fileId}`;
    console.log("Constructed video URL:", url);
    return url;
  }, [fileId]);

  const fetchVideoMetadata = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(videoUrl, {
        method: "HEAD",
        headers: {
          Accept: "*/*",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const totalChunks = parseInt(response.headers.get("X-Total-Chunks"));
      const chunkSize = parseInt(response.headers.get("X-Chunk-Size"));
      const maxChunkSize = parseInt(response.headers.get("X-Max-Chunk-Size"));
      const contentType = response.headers.get("Content-Type");
      const contentLength = response.headers.get("Content-Length");

      const metadata = {
        totalChunks,
        chunkSize,
        maxChunkSize,
        contentType,
        contentLength,
      };

      console.log("Video metadata:", metadata);
      setVideoMetadata(metadata);
    } catch (error) {
      console.error("Error fetching video metadata:", error);
      setError(error);
      toast.error("Có lỗi khi tải thông tin video");
    } finally {
      setIsLoading(false);
    }
  }, [videoUrl]);

  useEffect(() => {
    if (videoUrl) {
      fetchVideoMetadata();
    }
  }, [fetchVideoMetadata, videoUrl]);

  const handleError = useCallback(
    (error) => {
      console.error("Player error:", error);
      console.log("Video metadata:", videoMetadata);
      console.log("Current video URL:", videoUrl);
      console.log("Current fileId:", fileId);
      setError(error);
      toast.error("Có lỗi khi phát video");
    },
    [fileId, videoUrl, videoMetadata]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const handleLoadStart = () => setIsLoading(true);
    const handleLoadedData = () => {
      setIsLoading(false);
      if (autoPlay) {
        video.play().catch((error) => {
          console.warn("AutoPlay failed:", error);
        });
      }
    };
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);

    video.addEventListener("loadstart", handleLoadStart);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    return () => {
      video.removeEventListener("loadstart", handleLoadStart);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
    };
  }, [videoUrl, autoPlay]);

  if (error) {
    return (
      <div className="relative w-full h-48 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <p>Có lỗi khi tải video</p>
          <button
            className="mt-4 px-4 py-2 bg-white text-black rounded hover:bg-gray-100"
            onClick={fetchVideoMetadata}
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative w-full aspect-video bg-black"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
          <div className="text-white">Đang tải video...</div>
        </div>
      )}
      <div className="relative w-full h-full">
        <video
          ref={videoRef}
          className="w-full h-full"
          playsInline
          controls
          preload="metadata"
          src={videoUrl}
          onError={handleError}
          onEnded={onEnded}
          onTimeUpdate={onTimeUpdate}
        >
          Trình duyệt của bạn không hỗ trợ phát video.
        </video>
      </div>
      {isControlsVisible && !isLoading && (
        <div className="absolute top-1/2 left-0 right-0 flex items-center justify-between px-4 transform -translate-y-1/2 z-20">
          <button
            className="p-2 rounded-full bg-white bg-opacity-50 hover:bg-opacity-75 focus:outline-none transition-opacity"
            onClick={onPrevious}
            aria-label="Previous video"
          >
            <PreviousIcon className="w-6 h-6" />
          </button>
          <button
            className="p-2 rounded-full bg-white bg-opacity-50 hover:bg-opacity-75 focus:outline-none transition-opacity"
            onClick={onNext}
            aria-label="Next video"
          >
            <NextIcon className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
