"use client";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Sidebar from "./components/Sidebar";
import { usePathname } from "next/navigation";
import { Layout, theme } from "antd";

const { Content, Header } = Layout;
const inter = Inter({ subsets: ["latin"] });

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  return (
    <html lang="vi">
      <body className={inter.className} style={{ margin: 0, padding: 0 }}>
        {isLoginPage ? (
          children
        ) : (
          <Layout style={{ minHeight: '100vh' }}>
            <Sidebar />
            <Layout>
              <Header 
                style={{ 
                  padding: '0 24px', 
                  background: colorBgContainer,
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start'
                }}
              >
                <div className="text-lg font-medium">
                  {pathname === "/" && "Bảng điều khiển"}
                  {pathname === "/courses" && "Quản lý khóa học"}
                  {pathname === "/users" && "Quản lý người dùng"}
                  {pathname === "/transactions" && "Lịch sử giao dịch"}
                  {pathname === "/settings" && "Cài đặt hệ thống"}
                </div>
              </Header>
              <Content 
                style={{ 
                  margin: '24px 16px', 
                  padding: 24,
                  background: colorBgContainer,
                  borderRadius: borderRadiusLG,
                  minHeight: 280,
                  overflow: 'auto'
                }}
              >
                {children}
              </Content>
            </Layout>
          </Layout>
        )}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
