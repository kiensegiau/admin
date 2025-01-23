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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const videoUrl = useMemo(() => {
    if (!fileId) {
      console.warn("Không có fileId");
      return "";
    }

    if (fileId.startsWith("http")) {
      console.log("Sử dụng URL đầy đủ:", fileId);
      return fileId;
    }

    // Đảm bảo sử dụng HTTPS cho production và HTTP cho development
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
    const apiPath = fileId.includes("/api/proxy/files?id=")
      ? fileId
      : `/api/proxy/files?id=${fileId}`;
    const url = `${baseUrl}${apiPath}`;
    console.log("URL video đã tạo:", url);
    return url;
  }, [fileId]);

  const handleError = useCallback((error) => {
    console.error("Lỗi video:", error);
    setError(error);
    toast.error("Có lỗi khi phát video");
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const handleLoadStart = () => setIsLoading(true);
    const handleLoadedData = () => {
      setIsLoading(false);
      if (autoPlay) {
        video.play().catch((error) => {
          console.warn("Lỗi autoplay:", error);
        });
      }
    };
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);
    const handleProgress = () => {
      const buffered = video.buffered;
      if (buffered.length > 0) {
        const bufferedEnd = buffered.end(buffered.length - 1);
        const duration = video.duration;
        const progress = (bufferedEnd / duration) * 100;
        console.log(`Buffer progress: ${progress.toFixed(2)}%`);
      }
    };

    video.addEventListener("loadstart", handleLoadStart);
    video.addEventListener("loadeddata", handleLoadedData);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("error", handleError);

    // Thiết lập crossOrigin để xử lý CORS
    video.crossOrigin = "anonymous";
    video.preload = "auto";

    return () => {
      video.removeEventListener("loadstart", handleLoadStart);
      video.removeEventListener("loadeddata", handleLoadedData);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("error", handleError);
    };
  }, [videoUrl, autoPlay]);

  if (error) {
    return (
      <div className="relative w-full h-48 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <p>Có lỗi khi phát video</p>
          <button
            className="mt-4 px-4 py-2 bg-white text-black rounded hover:bg-gray-100"
            onClick={() => setError(null)}
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
          preload="auto"
          crossOrigin="anonymous"
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
