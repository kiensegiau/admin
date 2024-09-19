'use client';

import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import UserStats from '../components/UserStats';
import RevenueChart from '../components/RevenueChart';
import CourseList from '../components/CourseList';

export default function Dashboard() {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-200 p-6">
          <h1 className="text-3xl font-semibold text-gray-800 mb-6">Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <UserStats />
            <UserStats title="Tổng khóa học" value="50" />
            <UserStats title="Doanh thu tháng" value="$12,345" />
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <RevenueChart />
          </div>
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Khóa học mới nhất</h2>
            <CourseList />
          </div>
        </main>
      </div>
    </div>
  );
}