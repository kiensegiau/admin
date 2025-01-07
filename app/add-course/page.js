'use client';

import { Layout, Card } from 'antd';
import { useRef } from 'react';
import CourseForm from '../components/CourseForm';
import ImportFromDriveButton from '../components/ImportFromDriveButton';

const { Content } = Layout;

export default function AddCourse() {
  const formRef = useRef();

  const handleImportSuccess = (courseData) => {
    // Cập nhật form với dữ liệu từ Google Drive
    if (formRef.current) {
      formRef.current.setFieldsValue({
        title: courseData.title,
        description: courseData.description,
        // Có thể thêm các trường khác tùy theo yêu cầu
      });
    }
  };

  return (
    <Content className="p-6">
      <Card className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Thêm khóa học mới</h1>
          <p className="text-gray-500 mt-1">Điền thông tin chi tiết về khóa học của bạn</p>
        </div>
        
        <div className="mb-6">
          <ImportFromDriveButton onImportSuccess={handleImportSuccess} />
        </div>

        <CourseForm ref={formRef} />
      </Card>
    </Content>
  );
}