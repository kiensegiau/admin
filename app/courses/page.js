"use client";

import React, { useEffect, useState } from 'react';
import { Layout, Button, Table } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const { Content } = Layout;

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const coursesCollection = collection(db, 'courses');
      const coursesSnapshot = await getDocs(coursesCollection);
      const coursesList = coursesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCourses(coursesList);
    } catch (error) {
      console.error('Error fetching courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Link href={`/edit-course/${record.id}`}>
          Edit
        </Link>
      ),
    },
  ];

  return (
    <Content className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Courses</h1>
        <Link href="/add-course">
          <Button type="primary" icon={<PlusOutlined />}>
            Add Course
          </Button>
        </Link>
      </div>

      <Table 
        columns={columns} 
        dataSource={courses}
        loading={loading}
        rowKey="id"
      />
    </Content>
  );
}
