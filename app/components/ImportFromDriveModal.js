'use client';

import { useState } from 'react';
import { Modal, Input, Button, Alert, message } from 'antd';
import { CloudUploadOutlined } from '@ant-design/icons';

export default function ImportFromDriveModal({ isOpen, onClose, onImportSuccess }) {
  const [driveUrl, setDriveUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleImport = async () => {
    if (!driveUrl) {
      message.warning('Vui lòng nhập link Google Drive');
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch('/api/import-course-from-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: driveUrl }),
      });

      if (!response.ok) {
        throw new Error('Import failed');
      }

      const data = await response.json();
      message.success('Import khóa học thành công!');
      onImportSuccess(data);
      onClose();
    } catch (error) {
      console.error('Lỗi khi import:', error);
      message.error('Có lỗi xảy ra khi import khóa học');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      title="Import từ Google Drive"
      open={isOpen}
      onCancel={onClose}
      footer={null}
      width={600}
    >
      <div className="space-y-4">
        <Alert
          message="Hướng dẫn"
          description={
            <ul className="list-disc pl-4">
              <li>Chuẩn bị một thư mục Google Drive chứa nội dung khóa học</li>
              <li>Đảm bảo thư mục đã được chia sẻ công khai hoặc có quyền truy cập</li>
              <li>Sao chép link thư mục và dán vào ô bên dưới</li>
            </ul>
          }
          type="info"
          showIcon
          className="mb-4"
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Link Google Drive
          </label>
          <Input
            placeholder="https://drive.google.com/drive/folders/..."
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            prefix={<CloudUploadOutlined />}
            size="large"
          />
        </div>

        <div className="flex justify-end space-x-3 mt-6">
          <Button onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="primary"
            onClick={handleImport}
            loading={isLoading}
          >
            Import Khóa học
          </Button>
        </div>
      </div>
    </Modal>
  );
} 