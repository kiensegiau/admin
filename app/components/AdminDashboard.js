'use client';

import React from 'react';
import Link from 'next/link';
import { getAuthUrl } from '../utils/driveUpload';
import { useEffect, useState } from 'react';

const GoogleDriveButton = React.memo(() => {
  const handleClick = async () => {
    try {
      console.log('Đang lấy URL xác thực');
      const authUrl = await getAuthUrl();
      console.log('URL xác thực:', authUrl);
      if (authUrl) {
        window.location.href = authUrl;
      } else {
        console.error('Không nhận được URL xác thực');
      }
    } catch (error) {
      console.error('Lỗi khi lấy URL xác thực:', error);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300"
    >
      Kết nối Google Drive
    </button>
  );
});

export default function AdminDashboard() {
  const [isConnected, setIsConnected] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);

  useEffect(() => {
    console.log('Tất cả cookies:', document.cookie);
    console.log('Kiểm tra token trong AdminDashboard');

    const checkTokenFromServer = async () => {
      try {
        const response = await fetch('/api/check-token');
        const data = await response.json();
        console.log('Token từ server:', data);
        if (data.hasToken) {
          setIsConnected(true);
          setTokenInfo(data.tokenValue);
        }
      } catch (error) {
        console.error('Lỗi khi kiểm tra token từ server:', error);
      }
    };

    checkTokenFromServer();

    const checkToken = () => {
      const accessToken = document.cookie.split('; ').find(row => row.startsWith('googleDriveAccessToken='))?.split('=')[1];
      if (accessToken) {
        console.log('Tìm thấy access token:', accessToken.substring(0, 20) + '...');
        setIsConnected(true);
        setTokenInfo(accessToken);
      } else {
        console.log('Không tìm thấy access token');
        setIsConnected(false);
        setTokenInfo(null);
      }
    };

    checkToken();
    // Kiểm tra lại sau 1 giây để đảm bảo cookie đã được set
    const timer = setTimeout(checkToken, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div>
      <h1>Admin Dashboard</h1>
      {console.log('Rendering AdminDashboard, isConnected:', isConnected)}
      {isConnected ? (
        <div>
          <p className="text-green-500">Đã kết nối với Google Drive</p>
          <p>Access Token: {tokenInfo ? tokenInfo.substring(0, 20) + '...' : 'Không có thông tin'}</p>
        </div>
      ) : (
        <GoogleDriveButton />
      )}
      <Link href="/google-drive-upload" className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition duration-300 ml-4">
        Tải lên Google Drive
      </Link>
      {/* Thêm các phần khác của dashboard ở đây */}
    </div>
  );
}