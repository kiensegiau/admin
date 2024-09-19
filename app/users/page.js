'use client';

import UserList from '../components/UserList';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';

export default function Users() {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-200 p-6">
          <h1 className="text-3xl font-semibold text-gray-800 mb-6">Quản lý người dùng</h1>
          <div className="bg-white rounded-lg shadow-md p-6">
            <UserList />
          </div>
        </main>
      </div>
    </div>
  );
}