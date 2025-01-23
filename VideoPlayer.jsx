import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Plyr from "plyr-react";
import { toast } from "sonner";
import { useControlsVisibility } from "../hooks/useControlsVisibility";
import { PLAYER_OPTIONS } from "../constants/playerOptions";
import { PreviousIcon, NextIcon } from "./icons/NavigationIcons";
import "plyr-react/plyr.css";

export default function VideoPlayer({
  fileId,
  onEnded,
  onTimeUpdate,
  onNext,
  onPrevious,
  autoPlay = true,
}) {
  const playerRef = useRef(null);
  const { isControlsVisible, handleMouseMove, handleMouseLeave } =
    useControlsVisibility();
  const [videoMetadata, setVideoMetadata] = useState(null);

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
      const response = await fetch(videoUrl, { method: "HEAD" });
      if (!response.ok) {
        throw new Error("Failed to fetch video metadata");
      }

      const totalChunks = parseInt(response.headers.get("X-Total-Chunks"));
      const chunkSize = parseInt(response.headers.get("X-Chunk-Size"));
      const maxChunkSize = parseInt(response.headers.get("X-Max-Chunk-Size"));

      setVideoMetadata({
        totalChunks,
        chunkSize,
        maxChunkSize,
      });
    } catch (error) {
      console.error("Error fetching video metadata:", error);
      toast.error("Có lỗi khi tải thông tin video");
    }
  }, [videoUrl]);

  const handleSeek = useCallback(
    async (seekPosition) => {
      if (!videoMetadata) return;

      const { totalChunks, chunkSize } = videoMetadata;
      const chunkIndex = Math.floor(seekPosition / (chunkSize / 1000));
      const chunkUrl = `${videoUrl}&range=${chunkIndex * chunkSize}-${
        (chunkIndex + 1) * chunkSize - 1
      }`;

      try {
        const response = await fetch(chunkUrl);
        if (!response.ok) {
          throw new Error("Failed to fetch video chunk");
        }

        const chunkData = await response.arrayBuffer();
        const videoElement = playerRef.current?.elements?.media;
        if (videoElement) {
          const mediaSource = new MediaSource();
          videoElement.src = URL.createObjectURL(mediaSource);
          mediaSource.addEventListener("sourceopen", () => {
            const sourceBuffer = mediaSource.addSourceBuffer(
              response.headers.get("Content-Type")
            );
            sourceBuffer.appendBuffer(chunkData);
            sourceBuffer.addEventListener("updateend", () => {
              if (!sourceBuffer.updating && mediaSource.readyState === "open") {
                mediaSource.endOfStream();
                videoElement.currentTime = seekPosition;
              }
            });
          });
        }
      } catch (error) {
        console.error("Error fetching video chunk:", error);
        toast.error("Có lỗi khi tải video chunk");
      }
    },
    [videoUrl, videoMetadata]
  );

  useEffect(() => {
    fetchVideoMetadata();
  }, [fetchVideoMetadata]);

  useEffect(() => {
    const videoElement = playerRef.current?.elements?.media;
    if (videoElement) {
      videoElement.addEventListener("seeking", () => {
        const seekPosition = videoElement.currentTime;
        handleSeek(seekPosition);
      });
    }
  }, [handleSeek]);

  const handleError = useCallback(
    (error) => {
      console.error("Player error:", error);
      console.log("Current video URL:", videoUrl);
      console.log("Current fileId:", fileId);
      toast.error("Có lỗi khi phát video");
    },
    [fileId, videoUrl]
  );

  useEffect(() => {
    console.log("FileId received:", fileId);
  }, [fileId]);

  useEffect(() => {
    const container = playerRef.current?.elements?.container;
    if (!container) return;

    const handlePreviousVideo = () => {
      onPrevious?.();
    };

    const handleNextVideo = () => {
      onNext?.();
    };

    const previousButton = container.querySelector(
      ".plyr__controls__item.plyr__control--prev"
    );
    const nextButton = container.querySelector(
      ".plyr__controls__item.plyr__control--next"
    );

    previousButton?.addEventListener("click", handlePreviousVideo);
    nextButton?.addEventListener("click", handleNextVideo);

    return () => {
      previousButton?.removeEventListener("click", handlePreviousVideo);
      nextButton?.removeEventListener("click", handleNextVideo);
    };
  }, [onNext, onPrevious]);

  return (
    <div
      className="relative w-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Plyr
        ref={playerRef}
        source={videoUrl}
        options={PLAYER_OPTIONS}
        autoPlay={autoPlay}
      />
      {isControlsVisible && (
        <div className="absolute top-1/2 left-0 right-0 flex items-center justify-between px-4 transform -translate-y-1/2">
          <button
            className="p-2 rounded-full bg-white bg-opacity-50 hover:bg-opacity-75 focus:outline-none"
            onClick={onPrevious}
          >
            <PreviousIcon className="w-6 h-6" />
          </button>
          <button
            className="p-2 rounded-full bg-white bg-opacity-50 hover:bg-opacity-75 focus:outline-none"
            onClick={onNext}
          >
            <NextIcon className="w-6 h-6" />
          </button>
        </div>
      )}
    </div>
  );
}
