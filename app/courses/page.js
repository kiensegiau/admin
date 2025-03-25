"use client";

import React, { useEffect, useState } from "react";
import {
  Layout,
  Button,
  Table,
  Card,
  Space,
  Typography,
  message,
  Modal,
  Input,
  Row,
  Col,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Title } = Typography;
const { Content } = Layout;
const { confirm } = Modal;
const { Search } = Input;

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const response = await fetch("/api/courses");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể tải danh sách khóa học");
      }

      setCourses(data.courses);
      setFilteredCourses(data.courses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      message.error("Không thể tải danh sách khóa học");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (value) => {
    setSearchText(value);
    
    if (!value || value.trim() === '') {
      setFilteredCourses(courses);
      return;
    }
    
    const lowercasedQuery = value.toLowerCase().trim();
    const results = courses.filter(course => 
      (course.title && course.title.toLowerCase().includes(lowercasedQuery)) ||
      (course.description && course.description.toLowerCase().includes(lowercasedQuery))
    );
    
    setFilteredCourses(results);
  };

  const handleDelete = async (id, title) => {
    confirm({
      title: "Xác nhận xóa khóa học",
      content: `Bạn có chắc chắn muốn xóa khóa học "${title}" không?`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      async onOk() {
        try {
          setLoading(true);
          const response = await fetch("/api/courses/delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ courseId: id }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Có lỗi xảy ra");
          }

          message.success("Xóa khóa học thành công");
          await fetchCourses();
        } catch (error) {
          console.error("Lỗi khi xóa:", error);
          message.error(
            error.message || "Không thể xóa khóa học. Vui lòng thử lại sau."
          );
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const columns = [
    {
      title: "Tên khóa học",
      dataIndex: "title",
      key: "title",
      render: (text) => <Typography.Text strong>{text}</Typography.Text>,
      width: "70%",
    },
    {
      title: "Thao tác",
      key: "actions",
      width: "30%",
      align: "center",
      render: (_, record) => (
        <Space size="middle">
          <Link href={`/edit-course/${record.id}`}>
            <Button type="primary" icon={<EditOutlined />} size="middle">
              Sửa
            </Button>
          </Link>
          <Button
            type="primary"
            danger
            icon={<DeleteOutlined />}
            size="middle"
            onClick={() => handleDelete(record.id, record.title)}
          >
            Xóa
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Content className="p-6 min-h-screen bg-gray-50">
      <Card className="shadow-sm">
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} md={12}>
            <Title level={2} style={{ margin: 0 }}>
              Quản lý khóa học
            </Title>
          </Col>
          <Col xs={24} md={12} className="flex justify-end items-center gap-2">
            <Search
              placeholder="Tìm kiếm khóa học"
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              onSearch={handleSearch}
              onChange={(e) => e.target.value === "" && handleSearch("")}
              style={{ maxWidth: 400 }}
            />
            <Link href="/add-course">
              <Button type="primary" icon={<PlusOutlined />} size="large">
                Thêm khóa học
              </Button>
            </Link>
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={filteredCourses}
          loading={loading}
          rowKey="id"
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `Tổng số ${total} khóa học`,
          }}
          bordered
          scroll={{ x: true }}
        />
      </Card>
    </Content>
  );
}
