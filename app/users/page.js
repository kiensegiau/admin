"use client";
import { Typography, Space, Button, Input, Row, Col, Card } from "antd";
import { UserAddOutlined, SearchOutlined } from "@ant-design/icons";
import UserList from "../components/UserList";
import { useState, useRef } from "react";
import AddUserModal from "../components/AddUserModal";

const { Title } = Typography;
const { Search } = Input;

export default function Users() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const userListRef = useRef(null);

  const handleAddSuccess = (newUser) => {
    // Sau khi thêm người dùng thành công, cập nhật danh sách
    // UserList sẽ tự động cập nhật thông qua API
  };

  const handleSearch = (value) => {
    setSearchQuery(value);
    if (userListRef.current && userListRef.current.searchUsers) {
      userListRef.current.searchUsers(value);
    }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <Card className="shadow-sm">
        <Row gutter={[16, 16]} className="mb-4">
          <Col xs={24} sm={12}>
            <Title level={2} style={{ margin: 0 }}>
              Quản lý người dùng
            </Title>
          </Col>
          <Col xs={24} sm={12} className="flex justify-end items-center gap-2">
            <Search
              placeholder="Tìm kiếm theo tên, email hoặc SĐT"
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              onSearch={handleSearch}
              onChange={(e) => e.target.value === "" && handleSearch("")}
              style={{ maxWidth: 400 }}
            />
            <Button 
              type="primary" 
              icon={<UserAddOutlined />} 
              onClick={() => setShowAddModal(true)}
              size="large"
            >
              Thêm người dùng
            </Button>
          </Col>
        </Row>
      </Card>
      
      <UserList ref={userListRef} searchQuery={searchQuery} />

      <AddUserModal 
        open={showAddModal} 
        onCancel={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
    </Space>
  );
}
