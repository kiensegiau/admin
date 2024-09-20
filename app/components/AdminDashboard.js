import React from 'react';

export default function AdminDashboard() {
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <button
        onClick={() => window.location.href = '/api/auth/google'}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300"
      >
        Kết nối Google Drive
      </button>
      {/* Thêm các phần khác của dashboard ở đây */}
    </div>
  );
}