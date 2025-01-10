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
      <Layout style={{ minHeight: "100vh" }}>
        <Sidebar />
        <Layout>
          <div className="p-8">
            {children}
          </div>
        </Layout>
      </Layout>
    </div>
  );
}

export default function RootLayout({ children }) {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <RootLayoutContent>{children}</RootLayoutContent>
        </AuthProvider>
      </body>
    </html>
  );
}
