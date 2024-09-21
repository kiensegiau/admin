import React from 'react';
import Link from 'next/link';

const GoogleDriveButton = React.memo(() => (
  <Link href="/api/auth/google">
    <a className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300">
      Kết nối Google Drive
    </a>
  </Link>
));

export default function AdminDashboard() {
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <GoogleDriveButton />
      {/* Thêm các phần khác của dashboard ở đây */}
    </div>
  );
}