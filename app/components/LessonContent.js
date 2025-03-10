"use client";

import React, { useState } from "react";
import { List, Tag, Typography, Modal, Button } from "antd";
import {
  FileOutlined,
  VideoCameraOutlined,
  FileImageOutlined,
  FilePdfOutlined,
} from "@ant-design/icons";
import VideoPlayer from "./VideoPlayer";

const { Title, Text } = Typography;

export default function LessonContent({ lesson, courseId, chapterId }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);

  // Xác định icon dựa vào loại file
  const getFileIcon = (type) => {
    switch (type) {
      case "video":
        return (
          <VideoCameraOutlined style={{ fontSize: "18px", color: "#ff4d4f" }} />
        );
      case "image":
        return (
          <FileImageOutlined style={{ fontSize: "18px", color: "#1890ff" }} />
        );
      case "document":
        return (
          <FilePdfOutlined style={{ fontSize: "18px", color: "#52c41a" }} />
        );
      default:
        return <FileOutlined style={{ fontSize: "18px" }} />;
    }
  };

  // Xử lý khi click vào file
  const handleFileClick = (file) => {
    setSelectedFile(file);

    // Kiểm tra kỹ hơn: chỉ mở VideoPlayer cho video thực sự
    if (
      file.type === "video" &&
      file.storage?.provider === "wasabi" &&
      (file.mimeType?.includes("video/") ||
        file.originalName?.match(/\.(mp4|webm|ogg|mov)$/i))
    ) {
      setVideoModalVisible(true);
    } else if (file.storage?.provider === "wasabi") {
      // Đối với các file khác lưu trên Wasabi (PDF, hình ảnh...), tạo URL tạm thời
      fetchDirectUrl(file);
    } else if (file.proxyUrl) {
      // Mở file qua proxy URL nếu có
      window.open(file.proxyUrl, "_blank");
    } else {
      // Thông báo nếu không có cách nào để mở file
      console.error("Không thể mở file:", file);
      // Có thể hiển thị toast thông báo ở đây
    }
  };

  // Hàm lấy URL trực tiếp cho các file không phải video
  const fetchDirectUrl = async (file) => {
    try {
      if (!file.storage?.key) {
        console.error("Không tìm thấy key của file");
        return;
      }

      // Gọi API để lấy URL tạm thời
      const response = await fetch(
        `/api/upload-to-wasabi/share?key=${encodeURIComponent(
          file.storage.key
        )}&expires=3600`
      );

      if (!response.ok) {
        throw new Error("Không thể lấy URL file");
      }

      const data = await response.json();

      // Mở URL trong tab mới
      window.open(data.shareUrl, "_blank");
    } catch (error) {
      console.error("Lỗi khi lấy URL file:", error);
      // Có thể hiển thị toast thông báo lỗi ở đây
    }
  };

  // Đóng modal video
  const handleCloseVideoModal = () => {
    setVideoModalVisible(false);
    setSelectedFile(null);
  };

  // Format kích thước file
  const formatFileSize = (size) => {
    if (!size) return "Unknown";

    const sizeNum = parseInt(size, 10);
    if (isNaN(sizeNum)) return size;

    if (sizeNum < 1024) return `${sizeNum} B`;
    if (sizeNum < 1024 * 1024) return `${(sizeNum / 1024).toFixed(1)} KB`;
    if (sizeNum < 1024 * 1024 * 1024)
      return `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
    return `${(sizeNum / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // Render item trong danh sách file
  const renderItem = (file) => (
    <List.Item
      className="cursor-pointer hover:bg-gray-50 rounded p-2 transition-colors"
      onClick={() => handleFileClick(file)}
    >
      <List.Item.Meta
        avatar={getFileIcon(file.type)}
        title={file.name}
        description={
          <div className="flex flex-wrap gap-2">
            <Tag
              color={
                file.type === "video"
                  ? "red"
                  : file.type === "document"
                  ? "green"
                  : "blue"
              }
            >
              {file.type.toUpperCase()}
            </Tag>
            <Text type="secondary">
              {formatFileSize(file.size || file.storage?.size)}
            </Text>
            {file.storage?.provider === "wasabi" && (
              <Tag color="volcano">Wasabi</Tag>
            )}
          </div>
        }
      />
    </List.Item>
  );

  return (
    <div className="p-4">
      <Title level={4}>{lesson.title || "Bài học"}</Title>

      {lesson?.files?.length === 0 ? (
        <div className="text-center text-gray-500 my-8">
          Chưa có file nào trong bài học này
        </div>
      ) : (
        <List
          className="mt-4"
          dataSource={lesson?.files || []}
          renderItem={renderItem}
        />
      )}

      {/* Modal xem video */}
      <Modal
        title={selectedFile?.name || "Xem video"}
        open={videoModalVisible}
        onCancel={handleCloseVideoModal}
        footer={[
          <Button key="close" onClick={handleCloseVideoModal}>
            Đóng
          </Button>,
        ]}
        width={800}
      >
        {selectedFile && selectedFile.storage?.key && (
          <VideoPlayer storageKey={selectedFile.storage.key} />
        )}
      </Modal>
    </div>
  );
}
