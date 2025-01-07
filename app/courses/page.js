"use client";

import { useState, useEffect } from 'react';
import { Layout, Card, Button, Table, Space, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

const { Content } = Layout;

const SUBJECT_COLORS = {
  math: 'blue',
  physics: 'purple',
  chemistry: 'green',
  biology: 'cyan',
  literature: 'magenta',
  english: 'orange',
  history: 'red',
  geography: 'volcano',
  informatics: 'geekblue',
};

const SUBJECT_LABELS = {
  math: 'Toán học',
  physics: 'Vật lý',
  chemistry: 'Hóa học',
  biology: 'Sinh học',
  literature: 'Ngữ văn',
  english: 'Tiếng Anh',
  history: 'Lịch sử',
  geography: 'Địa lý',
  informatics: 'Tin học',
};

const GRADE_LABELS = {
  grade6: 'Lớp 6',
  grade7: 'Lớp 7',
  grade8: 'Lớp 8',
  grade9: 'Lớp 9',
  grade10: 'Lớp 10',
  grade11: 'Lớp 11',
  grade12: 'Lớp 12',
};

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'courses'));
      const coursesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setCourses(coursesData);
    } catch (error) {
      console.error('Lỗi khi lấy danh sách khóa học:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Tên khóa học',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <Link href={`/edit-course/${record.id}`} className="text-blue-600 hover:text-blue-800">
          {text}
        </Link>
      ),
    },
    {
      title: 'Giảng viên',
      dataIndex: 'teacher',
      key: 'teacher',
    },
    {
      title: 'Môn học',
      dataIndex: 'subject',
      key: 'subject',
      render: subject => (
        <Tag color={SUBJECT_COLORS[subject]}>
          {SUBJECT_LABELS[subject]}
        </Tag>
      ),
    },
    {
      title: 'Lớp',
      dataIndex: 'grade',
      key: 'grade',
      render: grade => GRADE_LABELS[grade],
      filters: Object.entries(GRADE_LABELS).map(([value, label]) => ({
        text: label,
        value: value,
      })),
      onFilter: (value, record) => record.grade === value,
    },
    {
      title: 'Giá',
      dataIndex: 'price',
      key: 'price',
      render: price => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(price),
      sorter: (a, b) => a.price - b.price,
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Link href={`/edit-course/${record.id}`}>
            <Button type="link">Chỉnh sửa</Button>
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <Content className="p-6">
      <Card>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Danh sách khóa học</h1>
          <Link href="/add-course">
            <Button type="primary" icon={<PlusOutlined />}>
              Thêm khóa học
            </Button>
          </Link>
        </div>
        
        <Table
          columns={columns}
          dataSource={courses}
          rowKey="id"
          loading={loading}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Tổng số ${total} khóa học`,
          }}
        />
      </Card>
    </Content>
  );
}
