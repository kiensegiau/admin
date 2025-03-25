"use client";
import { Typography, Space, Button } from "antd";
import { UserAddOutlined } from "@ant-design/icons";
import UserList from "../components/UserList";
import { useState } from "react";
import AddUserModal from "../components/AddUserModal";

const { Title } = Typography;

export default function Users() {
  const [showAddModal, setShowAddModal] = useState(false);

  const handleAddSuccess = (newUser) => {
    // Sau khi thêm người dùng thành công, cập nhật danh sách
    // UserList sẽ tự động cập nhật thông qua API
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div className="flex justify-between items-center">
        <Title level={2} style={{ margin: 0 }}>
          Quản lý người dùng
        </Title>
        <Button 
          type="primary" 
          icon={<UserAddOutlined />} 
          onClick={() => setShowAddModal(true)}
        >
          Thêm người dùng
        </Button>
      </div>
      <UserList />

      <AddUserModal 
        open={showAddModal} 
        onCancel={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
    </Space>
  );
}
