"use client";

import { Layout, Menu } from "antd";
import {
  DashboardOutlined,
  BookOutlined,
  UserOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

const { Sider } = Layout;

const menuItems = [
  {
    key: "/",
    icon: <DashboardOutlined />,
    label: "Tổng quan",
  },
  {
    key: "/courses",
    icon: <BookOutlined />,
    label: "Khóa học",
  },
  {
    key: "/users",
    icon: <UserOutlined />,
    label: "Người dùng",
  },
  {
    key: "/settings",
    icon: <SettingOutlined />,
    label: "Cài đặt",
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleMenuClick = ({ key }) => {
    router.push(key);
  };

  return (
    <Sider
      width={200}
      theme="light"
      className="min-h-screen border-r border-gray-200"
      style={{
        background: "#fff",
      }}
    >
      <div className="h-16 flex items-center justify-center border-b border-gray-200">
        <span className="text-lg font-bold">ADMIN</span>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[pathname]}
        style={{
          height: "calc(100% - 64px)",
          borderRight: 0,
        }}
        items={menuItems}
        onClick={handleMenuClick}
      />
    </Sider>
  );
}
