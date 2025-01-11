"use client";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { AuthProvider } from "./providers/AuthProvider";
import Sidebar from "./components/Sidebar";
import { usePathname } from "next/navigation";
import { Layout } from "antd";

const inter = Inter({ subsets: ["latin"] });

function RootLayoutContent({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  if (isLoginPage) {
    return <div className={inter.className}>{children}</div>;
  }

  return (
    <div className={inter.className}>
      <Toaster position="top-center" richColors />
      <Layout hasSider style={{ minHeight: '100vh' }}>
        <Sidebar />
        <Layout 
          style={{ 
            marginLeft: 200,
            background: '#f5f5f5'
          }}
        >
          <Layout.Content
            style={{
              margin: '24px',
              padding: '24px',
              background: '#fff',
              borderRadius: '8px',
              minHeight: 'calc(100vh - 48px)',
              overflow: 'auto'
            }}
          >
            {children}
          </Layout.Content>
        </Layout>
      </Layout>
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body style={{ 
        margin: 0, 
        padding: 0,
        background: '#f5f5f5'
      }}>
        <AuthProvider>
          <RootLayoutContent>{children}</RootLayoutContent>
        </AuthProvider>
      </body>
    </html>
  );
}
