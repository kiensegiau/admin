'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import Link from 'next/link';

export default function CourseList() {
  const [courses, setCourses] = useState([]);

  useEffect(() => {
    const fetchCourses = async () => {
      const querySnapshot = await getDocs(collection(db, 'courses'));
      const courseList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCourses(courseList);
    };

    fetchCourses();
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {courses.map(course => (
        <div key={course.id} className="border p-4 rounded">
          <h2 className="text-xl font-bold">{course.title}</h2>
          <p>{course.description}</p>
          <Link href={`/edit-course/${course.id}`} className="text-blue-500">
            Chỉnh sửa
          </Link>
        </div>
      ))}
    </div>
  );
}