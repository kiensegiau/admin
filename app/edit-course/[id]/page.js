"use client";

import React, { useState, useEffect } from "react";
import { Card, Collapse } from "antd";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/app/firebase";

const { Panel } = Collapse;

export default function EditCoursePage({ params }) {
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        console.log('\n=== Bắt đầu lấy dữ liệu khóa học ===');
        console.log('Course ID:', params.id);
        
        const docRef = doc(db, "courses", params.id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const courseData = { id: docSnap.id, ...docSnap.data() };
          console.log('\nDữ liệu khóa học:', courseData);
          console.log('\nChi tiết:');
          console.log('- Tên khóa học:', courseData.title);
          console.log('- Số lượng chương:', courseData.chapters?.length);
          courseData.chapters?.forEach((chapter, idx) => {
            console.log(`\nChương ${idx + 1}:`, chapter.title);
            console.log('- ID:', chapter.id);
            console.log('- Số bài học:', chapter.lessons?.length);
            chapter.lessons?.forEach((lesson, lessonIdx) => {
              console.log(`  Bài ${lessonIdx + 1}:`, lesson.title);
              console.log('  - ID:', lesson.id);
              console.log('  - Số file:', lesson.files?.length);
            });
          });
          setCourse(courseData);
        } else {
          console.log('Không tìm thấy khóa học!');
        }
      } catch (error) {
        console.error('Lỗi khi lấy dữ liệu:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [params.id]);

  if (loading) {
    return <div className="flex justify-center items-center h-screen">Đang tải...</div>;
  }

  if (!course) {
    return <div>Không tìm thấy khóa học</div>;
  }

  return (
    <div className="p-6">
      <Card title={course.title}>
        <Collapse accordion>
          {course.chapters?.map((chapter, index) => (
            <Panel header={chapter.title} key={chapter.id}>
              <Collapse accordion>
                {chapter.lessons?.map((lesson, idx) => (
                  <Panel header={lesson.title} key={lesson.id}>
                    <div className="p-2">
                      <p>Số file: {lesson.files?.length || 0}</p>
                      {lesson.files?.map((file, fileIdx) => (
                        <div key={fileIdx} className="ml-4">
                          • {file.name}
                        </div>
                      ))}
                    </div>
                  </Panel>
                ))}
              </Collapse>
            </Panel>
          ))}
        </Collapse>
      </Card>
    </div>
  );
}
