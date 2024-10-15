'use client';
import { useState, useEffect } from 'react';
import { Breadcrumb, List, Button, message } from 'antd';
import { FolderOutlined, LeftOutlined } from '@ant-design/icons';

export default function GoogleDriveFolderSelector({ onSelect, courseId }) {
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState('root');
  const [folderPath, setFolderPath] = useState([{ id: 'root', name: 'Root' }]);

  useEffect(() => {
    fetchFolders(currentFolder);
  }, [currentFolder]);

  const fetchFolders = async (folderId) => {
    try {
      const response = await fetch(`/api/get-drive-structure?folderId=${folderId}`);
      const data = await response.json();
      setFolders(data.folders);
    } catch (error) {
      console.error('Lỗi khi lấy danh sách thư mục:', error);
      message.error('Không thể lấy danh sách thư mục');
    }
  };

  const handleFolderClick = (folder) => {
    setCurrentFolder(folder.id);
    setFolderPath([...folderPath, { id: folder.id, name: folder.name }]);
  };

  const handleBackClick = () => {
    if (folderPath.length > 1) {
      const newPath = folderPath.slice(0, -1);
      setFolderPath(newPath);
      setCurrentFolder(newPath[newPath.length - 1].id);
    }
  };

  const handleSelect = () => {
    onSelect(currentFolder, folderPath[folderPath.length - 1].name, courseId);
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <Breadcrumb className="mb-4">
        {folderPath.map((folder, index) => (
          <Breadcrumb.Item key={folder.id}>
            <a onClick={() => setCurrentFolder(folder.id)}>{folder.name}</a>
          </Breadcrumb.Item>
        ))}
      </Breadcrumb>
      {folderPath.length > 1 && (
        <Button icon={<LeftOutlined />} onClick={handleBackClick} className="mb-4">
          Quay lại
        </Button>
      )}
      <List
        dataSource={folders}
        renderItem={(folder) => (
          <List.Item
            key={folder.id}
            onClick={() => handleFolderClick(folder)}
            className="cursor-pointer hover:bg-gray-100 transition-colors duration-200"
          >
            <FolderOutlined className="mr-2 text-yellow-500" />
            {folder.name}
          </List.Item>
        )}
      />
      <Button
        type="primary"
        onClick={handleSelect}
        className="mt-4"
      >
        Chọn thư mục này
      </Button>
    </div>
  );
}
