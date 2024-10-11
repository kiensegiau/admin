'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import Link from 'next/link';
import { toast } from 'sonner';
import { Spin } from 'antd';

const CourseItem = React.memo(({ course, onDelete }) => (
  <div className="border p-4 rounded">
    <h2 className="text-xl font-bold">{course.title}</h2>
    <p>{course.description}</p>
    <p className="font-bold">Giá: {course.price} VND</p>
    <div className="mt-4">
      <Link href={`/edit-course/${course.id}`} className="text-blue-500 mr-2" prefetch={false}>
        Xem chi tiết
      </Link>
      <button onClick={() => onDelete(course.id)} className="text-red-500">
        Xóa
      </button>
    </div>
  </div>
));

export default function CourseList() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    try {
      const querySnapshot = await getDocs(collection(db, 'courses'));
      setCourses(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Lỗi khi lấy danh sách khóa học:", error);
      toast.error("Không thể tải danh sách khóa học");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const deleteCourse = useCallback(async (courseId) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa khóa học này?")) {
      try {
        await deleteDoc(doc(db, 'courses', courseId));
        setCourses(prevCourses => prevCourses.filter(course => course.id !== courseId));
        toast.success("Khóa học đã được xóa");
      } catch (error) {
        console.error("Lỗi khi xóa khóa học:", error);
        toast.error("Không thể xóa khóa học");
      }
    }
  }, []);

  return (
    <div>
      <div className="mb-4">
        <Link href="/add-course" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          Thêm khóa học mới
        </Link>
      </div>
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Spin size="large" tip="Đang tải..." />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(course => (
            <CourseItem key={course.id} course={course} onDelete={deleteCourse} />
          ))}
        </div>
      )}
    </div>
  );
}