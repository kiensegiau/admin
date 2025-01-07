'use client';

import { Layout, Menu, Button, Dropdown, Avatar, Space } from 'antd';
import { BellOutlined, UserOutlined, LogoutOutlined, SettingOutlined } from '@ant-design/icons';
import Link from 'next/link';

const { Header: AntHeader } = Layout;

const userMenuItems = [
  {
    key: 'profile',
    icon: <UserOutlined />,
    label: 'Hồ sơ',
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: 'Cài đặt',
  },
  {
    type: 'divider',
  },
  {
    key: 'logout',
    icon: <LogoutOutlined />,
    label: 'Đăng xuất',
    danger: true,
  },
];

export default function Header() {
  const handleMenuClick = ({ key }) => {
    if (key === 'logout') {
      // Xử lý đăng xuất
      console.log('Đăng xuất');
    }
  };

  return (
    <AntHeader className="px-6 bg-white flex items-center justify-between shadow-sm">
      <div className="flex items-center">
        <h1 className="text-lg font-medium text-gray-800">
          Xin chào, Admin
        </h1>
      </div>

      <Space size={16}>
        <Button 
          type="text" 
          icon={<BellOutlined />}
          className="flex items-center justify-center"
        />
        <Dropdown 
          menu={{ 
            items: userMenuItems,
            onClick: handleMenuClick,
          }}
          placement="bottomRight" 
          trigger={['click']}
        >
          <Button type="text" className="flex items-center">
            <Avatar icon={<UserOutlined />} />
            <span className="ml-2 hidden md:inline">Admin</span>
          </Button>
        </Dropdown>
      </Space>
    </AntHeader>
  );
}