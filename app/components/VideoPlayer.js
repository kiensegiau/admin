"use client";

import { useState, useEffect, useRef } from "react";
import { Spin, Alert, Button } from "antd";
import {
  FullscreenOutlined,
  PauseOutlined,
  PlayOutlined,
} from "@ant-design/icons";

export default function VideoPlayer({ storageKey }) {
  const [videoUrl, setVideoUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  // Lấy URL streaming khi component mount hoặc khi key thay đổi
  useEffect(() => {
    if (!storageKey) {
      setError("Thiếu key Wasabi của video");
      setLoading(false);
      return;
    }

    fetchStreamUrl();

    // Tạo interval để làm mới URL trước khi hết hạn
    const refreshInterval = setInterval(() => {
      if (expiresAt) {
        const now = new Date();
        const expiry = new Date(expiresAt);

        // Nếu URL sắp hết hạn (còn 5 phút), làm mới URL
        if (expiry - now < 5 * 60 * 1000) {
          fetchStreamUrl();
        }
      }
    }, 60000); // Kiểm tra mỗi phút

    return () => clearInterval(refreshInterval);
  }, [storageKey]);

  // Hàm lấy URL streaming từ API
  const fetchStreamUrl = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/stream?key=${encodeURIComponent(storageKey)}`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Không thể lấy URL video");
      }

      const data = await response.json();
      setVideoUrl(data.streamUrl);
      setExpiresAt(data.expiresAt);
      setError(null);
    } catch (err) {
      console.error("Lỗi khi lấy URL streaming:", err);
      setError(err.message || "Không thể phát video");
    } finally {
      setLoading(false);
    }
  };

  // Xử lý khi video gặp lỗi
  const handleVideoError = () => {
    console.error("Video playback error");
    // Thử lấy lại URL streaming
    fetchStreamUrl();
  };

  // Xử lý khi nhấn nút fullscreen
  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      } else if (videoRef.current.msRequestFullscreen) {
        videoRef.current.msRequestFullscreen();
      }
    }
  };

  // Xử lý khi nhấn nút play/pause
  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spin tip="Đang tải video..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-64">
        <Alert
          message="Lỗi phát video"
          description={error}
          type="error"
          action={
            <Button size="small" type="primary" onClick={fetchStreamUrl}>
              Thử lại
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full rounded-lg"
        controls
        controlsList="nodownload"
        onError={handleVideoError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      <div className="absolute top-4 right-4 flex space-x-2">
        <Button
          type="primary"
          shape="circle"
          icon={isPlaying ? <PauseOutlined /> : <PlayOutlined />}
          onClick={handlePlayPause}
          className="bg-blue-500"
        />
        <Button
          type="primary"
          shape="circle"
          icon={<FullscreenOutlined />}
          onClick={handleFullscreen}
          className="bg-blue-500"
        />
      </div>
    </div>
  );
}
