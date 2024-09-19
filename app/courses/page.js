"use client";

import CourseList from "../components/CourseList";
import Header from "../components/Header";
import Sidebar from "../components/Sidebar";

export default function Courses() {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-200 p-6">
          <h1 className="text-3xl font-semibold text-gray-800 mb-6">
            Quản lý khóa học
          </h1>
          <div className="bg-white rounded-lg shadow-md p-6">
            <CourseList />
          </div>
        </main>
      </div>
    </div>
  );
}
