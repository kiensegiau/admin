"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { 
  HomeOutlined, 
  BookOutlined, 
  UserOutlined, 
  CreditCardOutlined,
  LogoutOutlined,
  SettingOutlined,
  DashboardOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import { Layout, Menu, Button, Typography, Avatar, Divider, theme } from "antd";
import { useState, useEffect } from "react";

const { Sider } = Layout;
const { Title, Text } = Typography;

const menuItems = [
  {
    key: "dashboard",
    href: "/",
    label: "Trang chủ",
    icon: DashboardOutlined,
  },
  {
    key: "courses",
    href: "/courses",
    label: "Quản lý khóa học",
    icon: BookOutlined,
  },
  {
    key: "import-drive-simple",
    href: "/import-from-drive-simple",
    label: "Import Drive",
    icon: CloudUploadOutlined,
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
  const { token } = theme.useToken();
  const [selectedKeys, setSelectedKeys] = useState(['dashboard']);

  useEffect(() => {
    const activeItem = menuItems.find(item => item.href === pathname);
    if (activeItem) {
      setSelectedKeys([activeItem.key]);
    }
  }, [pathname]);

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

  return (
    <Sider
      collapsible
      collapsed={collapsed}
      onCollapse={value => setCollapsed(value)}
      theme="light"
      width={260}
      style={{ 
        background: 'white',
        boxShadow: '0 1px 8px rgba(0,0,0,0.05)',
        overflow: 'auto',
        height: '100vh',
        position: 'sticky',
        left: 0,
        top: 0,
        zIndex: 10,
      }}
      className="sidebar-custom"
    >
      <div 
        className="flex items-center justify-center py-6"
        style={{
          background: `linear-gradient(135deg, ${token.colorPrimary} 0%, #1890ff 100%)`,
          marginBottom: 0,
          padding: collapsed ? '24px 0' : '20px 0',
        }}
      >
        {collapsed ? (
          <Avatar 
            size={40}
            style={{ 
              backgroundColor: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            A
          </Avatar>
        ) : (
          <div className="text-center">
            <Avatar 
              size={50}
              style={{ 
                backgroundColor: 'white',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                marginBottom: 8
              }}
            >
              A
            </Avatar>
            <Title 
              level={4} 
              style={{ 
                margin: 0, 
                color: 'white',
                fontWeight: 600,
                letterSpacing: '0.5px'
              }}
            >
              ADMIN PORTAL
            </Title>
            <Text style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)' }}>
              Hệ thống quản trị
            </Text>
          </div>
        )}
      </div>

      <div style={{ padding: collapsed ? '16px 0' : '16px 16px' }}>
        <div
          style={{
            borderRadius: token.borderRadiusLG,
            background: token.colorBgElevated,
            padding: collapsed ? '12px 8px' : '12px 14px',
            marginBottom: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }}
        >
          <div className="flex items-center justify-center">
            <Avatar 
              style={{ 
                backgroundColor: token.colorPrimary,
              }}
              icon={<UserOutlined />}
              size={collapsed ? 'default' : 36}
            />
            {!collapsed && (
              <div className="ml-2">
                <Text strong style={{ display: 'block', fontSize: '13px' }}>
                  Quản Trị Viên
                </Text>
                <Text style={{ fontSize: '12px', color: token.colorTextSecondary }}>
                  Super Admin
                </Text>
              </div>
            )}
          </div>
        </div>
      </div>

      <Menu
        mode="inline"
        selectedKeys={selectedKeys}
        style={{ 
          borderRight: 'none',
          padding: '0 12px',
          fontSize: '14px'
        }}
        items={menuItems.map(item => ({
          key: item.key,
          icon: <item.icon style={{ fontSize: '18px' }} />,
          label: <Link href={item.href} style={{ color: 'inherit' }}>{item.label}</Link>,
        }))}
      />

      <div 
        style={{ 
          position: 'absolute', 
          bottom: 16, 
          width: '100%', 
          textAlign: 'center',
          padding: '0 16px'
        }}
      >
        <Divider style={{ margin: '8px 0' }} />
        <Button 
          danger 
          icon={<LogoutOutlined />}
          onClick={handleSignOut}
          style={{ 
            width: '100%',
            borderRadius: token.borderRadiusLG,
            height: 40
          }}
        >
          {!collapsed && "Đăng xuất"}
        </Button>
      </div>

      <style jsx global>{`
        .sidebar-custom .ant-layout-sider-trigger {
          background: white;
          color: rgba(0, 0, 0, 0.45);
          border-top: 1px solid #f0f0f0;
        }
        
        .sidebar-custom .ant-menu-item {
          border-radius: 6px;
          margin: 4px 0;
        }
        
        .sidebar-custom .ant-menu-item-selected {
          background-color: ${token.colorPrimary} !important;
          color: white;
          font-weight: 500;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
      `}</style>
    </Sider>
  );
}
