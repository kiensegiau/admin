"use client";
import { Typography, Space, Button } from "antd";
import { UserAddOutlined } from "@ant-design/icons";
import UserList from "../components/UserList";

const { Title } = Typography;

export default function Users() {
  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <div className="flex justify-between items-center">
        <Title level={2} style={{ margin: 0 }}>
          Quản lý người dùng
        </Title>
        <Button type="primary" icon={<UserAddOutlined />}>
          Thêm người dùng
        </Button>
      </div>
      <UserList />
    </Space>
  );
}
