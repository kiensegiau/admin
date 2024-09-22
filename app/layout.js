'use client';
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Inter } from 'next/font/google'
import "./globals.css"
import Header from './components/Header'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({ children }) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch = () => {}; // Vô hiệu hóa prefetch mặc định
  }, [router]);

  return (
    <html lang="en">
      <body className={inter.className}>
       
        {children}
        <Toaster />
      </body>
    </html>
  );
}
