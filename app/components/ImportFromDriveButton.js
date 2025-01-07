'use client';

import { useState } from 'react';
import { Button, Modal, Input, message } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';

export default function ImportFromDriveButton({ onImportSuccess }) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [driveUrl, setDriveUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const showModal = () => setIsModalVisible(true);
  const handleCancel = () => {
    setIsModalVisible(false);
    setDriveUrl('');
  };

  const handleImport = async () => {
    if (!driveUrl) {
      message.warning('Vui lòng nhập link Google Drive');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/import-course-from-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ driveUrl }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Lỗi khi import khóa học');
      }

      const data = await response.json();
      
      // Xử lý dữ liệu trả về
      const courseData = {
        title: data.title,
        description: `Khóa học được import từ Google Drive\n\nCấu trúc khóa học:\n${formatStructure(data.structure)}`,
        // Các trường khác có thể thêm tùy theo yêu cầu
      };

      message.success('Import khóa học thành công!');
      handleCancel();
      if (onImportSuccess) {
        onImportSuccess(courseData);
      }
    } catch (error) {
      console.error('Lỗi:', error);
      message.error(error.message || 'Có lỗi xảy ra khi import khóa học');
    } finally {
      setIsLoading(false);
    }
  };

  // Hàm format cấu trúc thư mục thành text
  const formatStructure = (structure, level = 0) => {
    const indent = '  '.repeat(level);
    let result = `${indent}${structure.name}\n`;

    if (structure.children) {
      structure.children.forEach(child => {
        if (child.type === 'folder') {
          result += formatStructure(child, level + 1);
        } else {
          result += `${indent}  - ${child.name}\n`;
        }
      });
    }

    return result;
  };

  return (
    <>
      <Button 
        type="primary" 
        icon={<CloudUploadOutlined />}
        onClick={showModal}
        className="mb-4"
      >
        Import từ Drive
      </Button>

      <Modal
        title="Import khóa học từ Google Drive"
        open={isModalVisible}
        onOk={handleImport}
        onCancel={handleCancel}
        confirmLoading={isLoading}
        okText="Import"
        cancelText="Hủy"
      >
        <div className="mb-4">
          <p className="mb-2">Nhập link Google Drive chứa nội dung khóa học:</p>
          <Input
            placeholder="https://drive.google.com/..."
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="text-gray-500 text-sm">
          <p>Lưu ý:</p>
          <ul className="list-disc pl-4">
            <li>Link phải là thư mục Google Drive được chia sẻ công khai</li>
            <li>Thư mục nên chứa các file video và tài liệu của khóa học</li>
            <li>Cấu trúc thư mục nên được tổ chức theo chương/bài học</li>
          </ul>
        </div>
      </Modal>
    </>
  );
} 