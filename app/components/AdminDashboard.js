'use client';

import React from 'react';
import Link from 'next/link';
import { getAuthUrl } from '../utils/driveUpload';
import { useEffect, useState } from 'react';
import testR2Connection from "../utils/r2DirectUpload";

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
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    console.log('Tất cả cookies:', document.cookie);
    console.log('Kiểm tra token trong AdminDashboard');

   
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

  const handleClearR2Bucket = async () => {
    if (window.confirm('Bạn có chắc chắn muốn xóa tất cả dữ liệu trong R2 bucket không?')) {
      setIsDeleting(true);
      try {
        const response = await fetch('/api/clear-r2-bucket', { method: 'POST' });
        const data = await response.json();
        if (response.ok) {
          alert(data.message);
        } else {
          throw new Error(data.error);
        }
      } catch (error) {
        console.error('Lỗi khi xóa dữ liệu R2:', error);
        alert('Có lỗi xảy ra khi xóa dữ liệu R2. Vui lòng thử lại sau.');
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <div>
      <h1>Admin Dashboard11111</h1>
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
      
      <button
        onClick={handleClearR2Bucket}
        disabled={isDeleting}
        className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition duration-300 ml-4"
      >
        {isDeleting ? 'Đang xóa...' : 'Xóa dữ liệu R2'}
      </button>
      
      {/* Thêm các phần khác của dashboard ở đây */}
    </div>
  );
}
