'use client';

import React, { Suspense, lazy, useEffect } from 'react';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import UserStats from '../components/UserStats';
import AdminDashboard from '../components/AdminDashboard';

const RevenueChart = lazy(() => import('../components/RevenueChart'));
const CourseList = lazy(() => import('../components/CourseList'));

export default function Dashboard() {
  useEffect(() => {
    console.log('Dashboard đang render');
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-200 p-6">
          <AdminDashboard />
          {/* Các phần còn lại của Dashboard */}
        </main>
      </div>
    </div>
  );
}