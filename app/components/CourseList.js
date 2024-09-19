'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import Link from 'next/link';
import { toast } from 'sonner';

export default function CourseList() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'courses'));
      const courseList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCourses(courseList);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách khóa học:", error);
      toast.error("Không thể tải danh sách khóa học");
    }
  };

  const deleteCourse = async (courseId) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa khóa học này?")) {
      try {
        await deleteDoc(doc(db, 'courses', courseId));
        setCourses(courses.filter(course => course.id !== courseId));
        toast.success("Khóa học đã được xóa");
      } catch (error) {
        console.error("Lỗi khi xóa khóa học:", error);
        toast.error("Không thể xóa khóa học");
      }
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Link href="/add-course" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
          Thêm khóa học mới
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map(course => (
          <div key={course.id} className="border p-4 rounded">
            <h2 className="text-xl font-bold">{course.title}</h2>
            <p>{course.description}</p>
            <p className="font-bold">Giá: {course.price} VND</p>
            <div className="mt-4">
              <Link href={`/edit-course/${course.id}`} className="text-blue-500 mr-2">
                Xem chi tiết
              </Link>
              <button onClick={() => deleteCourse(course.id)} className="text-red-500">
                Xóa
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}