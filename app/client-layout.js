"use client";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import Sidebar from "@/components/Sidebar";
import { usePathname } from "next/navigation";

const inter = Inter({ subsets: ["latin"] });

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login";

  return (
    <html lang="vi">
      <body className={inter.className}>
        {isLoginPage ? (
          children
        ) : (
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto bg-gray-50 p-8">
              {children}
            </main>
          </div>
        )}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
