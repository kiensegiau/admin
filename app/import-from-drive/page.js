'use client';
import { useState, useEffect } from 'react';
import { Layout, Typography, Alert, message, Button, Card } from 'antd';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import GoogleDriveFolderSelector from '../components/GoogleDriveFolderSelector';

const { Content } = Layout;
const { Title } = Typography;

export default function ImportFromDrive() {
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkToken = () => {
      const accessToken = document.cookie.split('; ').find(row => row.startsWith('googleDriveAccessToken='))?.split('=')[1];
      setIsConnected(!!accessToken);
    };

    checkToken();
  }, []);

  const handleFolderSelect = (folderId, folderName) => {
    setSelectedFolder({ id: folderId, name: folderName });
    message.success(`Đã chọn thư mục: ${folderName}`);
  };

  const handleImport = async () => {
    if (!selectedFolder) {
      message.warning('Vui lòng chọn thư mục trước khi import.');
      return;
    }

    try {
      const accessToken = document.cookie.split('; ').find(row => row.startsWith('googleDriveAccessToken='))?.split('=')[1];
      if (!accessToken) {
        throw new Error('Không tìm thấy access token');
      }

      console.log('Dữ liệu trước khi import:', {
        folderId: selectedFolder.id,
        folderName: selectedFolder.name,
        courseId: 'new'
      });

      const formData = new FormData();
      formData.append('folderId', selectedFolder.id);
      formData.append('courseId', 'new');
      formData.append('accessToken', accessToken);

      const response = await fetch('/api/import-course-from-drive', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        try {
          const data = JSON.parse(chunk.replace('data: ', ''));
          if (data.folderStructure) {
            console.log('Cấu trúc thư mục:');
            console.log(data.folderStructure);
          } else {
            console.log('Nhận được chunk:', data);
          }
        } catch (error) {
          console.error('Lỗi khi phân tích JSON:', error);
        }
      }

      console.log('Đã hoàn thành quá trình import');
    } catch (error) {
      console.error('Lỗi khi import khóa học:', error);
    }
  };

  return (
    <Layout className="min-h-screen">
      
      <Layout>
        <Header />
        <Content className="p-6">
          <Card className="w-full max-w-3xl mx-auto">
            <Title level={2} className="mb-6">Import từ Google Drive</Title>
            {isConnected ? (
              <>
                <GoogleDriveFolderSelector onSelect={handleFolderSelect} />
                {selectedFolder && (
                  <div className="mt-6">
                    <Alert
                      message={`Thư mục đã chọn: ${selectedFolder.name}`}
                      type="info"
                      showIcon
                      className="mb-4"
                    />
                    <Button
                      type="primary"
                      onClick={handleImport}
                      size="large"
                    >
                      Import Khóa học
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <Alert
                message="Chưa kết nối với Google Drive"
                description="Vui lòng kết nối với Google Drive trước khi import."
                type="warning"
                showIcon
              />
            )}
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}
