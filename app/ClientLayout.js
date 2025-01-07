'use client';

import { ConfigProvider, Layout, theme } from 'antd';
import { Toaster } from 'sonner';
import Header from './components/Header';
import Sidebar from './components/Sidebar';

export default function ClientLayout({ children }) {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
        },
        components: {
          Layout: {
            bodyBg: '#f5f5f5',
            headerBg: '#fff',
            siderBg: '#fff',
          },
          Menu: {
            itemBg: 'transparent',
            itemSelectedBg: '#e6f4ff',
            itemHoverBg: '#f5f5f5',
          },
          Card: {
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
          },
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Sidebar />
        <Layout>
          <Header />
          {children}
        </Layout>
      </Layout>
      <Toaster 
        position="top-right" 
        richColors 
        expand={true}
        closeButton={true}
      />
    </ConfigProvider>
  );
} 