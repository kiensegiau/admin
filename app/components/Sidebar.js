'use client';

import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  BookOutlined,
  UserOutlined,
  VideoCameraOutlined,
  FileTextOutlined,
  SettingOutlined,
  CloudUploadOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

const { Sider } = Layout;

const menuItems = [
  {
    key: 'dashboard',
    icon: <DashboardOutlined />,
    label: <Link href="/dashboard">Tổng quan</Link>,
  },
  {
    key: 'courses',
    icon: <BookOutlined />,
    label: <Link href="/courses">Khóa học</Link>,
  },
  {
    key: 'users',
    icon: <UserOutlined />,
    label: <Link href="/users">Học viên</Link>,
  },
  {
    key: 'videos',
    icon: <VideoCameraOutlined />,
    label: <Link href="/videos">Video</Link>,
  },
  {
    key: 'documents',
    icon: <FileTextOutlined />,
    label: <Link href="/documents">Tài liệu</Link>,
  },
  {
    type: 'divider',
  },
  {
    key: 'import',
    icon: <CloudUploadOutlined />,
    label: <Link href="/import-from-drive">Import từ Drive</Link>,
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: <Link href="/settings">Cài đặt</Link>,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const selectedKey = menuItems.find(item => item.key && pathname.startsWith(`/${item.key}`))?.key || 'dashboard';

  return (
    <Sider
      width={260}
      theme="light"
      className="min-h-screen border-r border-gray-200"
    >
      <div className="h-16 flex items-center justify-center border-b border-gray-200">
        <Link href="/" className="flex items-center space-x-2">
          <Image
            src="/logo.png"
            alt="Logo"
            width={32}
            height={32}
            className="w-8 h-8"
          />
          <span className="text-xl font-bold text-gray-800">
            Admin Portal
          </span>
        </Link>
      </div>
      <Menu
        mode="inline"
        selectedKeys={[selectedKey]}
        items={menuItems}
        className="border-r-0 py-4"
      />
    </Sider>
  );
}