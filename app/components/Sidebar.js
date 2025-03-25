"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  HomeOutlined, 
  BookOutlined, 
  UserOutlined, 
  CreditCardOutlined,
  LogoutOutlined,
  SettingOutlined 
} from "@ant-design/icons";
import { toast } from "sonner";
import { Layout, Menu, Button, Typography, Avatar } from "antd";
import { useState } from "react";

const { Sider } = Layout;
const { Title, Text } = Typography;

const menuItems = [
  {
    key: "home",
    href: "/",
    label: "Trang chủ",
    icon: HomeOutlined,
  },
  {
    key: "courses",
    href: "/courses",
    label: "Quản lý khóa học",
    icon: BookOutlined,
  },
  {
    key: "users",
    href: "/users",
    label: "Quản lý người dùng",
    icon: UserOutlined,
  },
  {
    key: "transactions",
    href: "/transactions",
    label: "Lịch sử giao dịch",
    icon: CreditCardOutlined,
  },
  {
    key: "settings",
    href: "/settings",
    label: "Cài đặt hệ thống",
    icon: SettingOutlined,
  }
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const handleSignOut = async () => {
    try {
      const res = await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      });

      const data = await res.json();

      if (data.success) {
        toast.success("Đăng xuất thành công");
        router.push("/login");
      } else {
        toast.error("Đăng xuất thất bại");
      }
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
      toast.error("Đăng xuất thất bại");
    }
  };

  // Tìm key của menu item đang active
  const activeKey = menuItems.find(item => item.href === pathname)?.key || 'home';

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={value => setCollapsed(value)}
      theme="light"
      className="shadow-md min-h-screen border-r border-gray-200"
      width={250}
      style={{ zIndex: 999 }}
    >
      <div className={`p-4 flex ${collapsed ? 'justify-center' : 'justify-start'} items-center border-b border-gray-200`}>
        {collapsed ? (
          <Avatar 
            size="large" 
            className="bg-blue-500 flex items-center justify-center"
          >
            A
          </Avatar>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar 
              size="large" 
              className="bg-blue-500 flex items-center justify-center"
            >
              A
            </Avatar>
            <div>
              <Title level={5} style={{ margin: 0 }}>Quản Trị Viên</Title>
              <Text type="secondary" style={{ fontSize: '12px' }}>Admin Portal</Text>
            </div>
          </div>
        )}
      </div>

      <Menu
        mode="inline"
        selectedKeys={[activeKey]}
        style={{ borderRight: 0 }}
        className="mt-2"
        items={menuItems.map(item => ({
          key: item.key,
          icon: <item.icon style={{ fontSize: '18px' }} />,
          label: <Link href={item.href}>{item.label}</Link>,
        }))}
      />

      <div className={`absolute bottom-0 w-full p-4 border-t border-gray-200 ${collapsed ? 'text-center' : ''}`}>
        <Button 
          danger
          icon={<LogoutOutlined />}
          onClick={handleSignOut}
          className="flex items-center gap-2"
          type="text"
          size="large"
          block
        >
          {!collapsed && "Đăng xuất"}
        </Button>
      </div>
    </Sider>
  );
}
