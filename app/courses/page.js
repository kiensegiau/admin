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
  Form,
  InputNumber,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, SaveOutlined, CloseOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Title, Text } = Typography;
const { Content } = Layout;
const { confirm } = Modal;
const { Search } = Input;

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

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

  const formatPrice = (price) => {
    if (!price && price !== 0) return "0";
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
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
      (course.description && course.description.toLowerCase().includes(lowercasedQuery)) ||
      (course.teacher && course.teacher.toLowerCase().includes(lowercasedQuery)) ||
      (course.price && course.price.toString().includes(lowercasedQuery))
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

  const startEditing = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      price: record.price || 0,
      teacher: record.teacher || "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    form.resetFields();
  };

  const saveEdit = async (record) => {
    try {
      if (!record || !record.id) {
        message.error("Vui lòng chọn khóa học để cập nhật");
        return;
      }

      const values = await form.validateFields();
      setLoading(true);

      // Đơn giản hóa dữ liệu gửi đi, chỉ gửi những trường cần thiết
      const updateData = {
        courseId: record.id,
        price: values.price,
        teacher: values.teacher,
      };
      
      console.log("Dữ liệu gửi đi (đơn giản hóa):", updateData);

      const response = await fetch("/api/courses/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();
      console.log("Phản hồi từ server:", data);
      
      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra");
      }

      message.success("Cập nhật thành công");
      setEditingId(null);
      form.resetFields();
      await fetchCourses();
    } catch (error) {
      console.error("Chi tiết lỗi:", error);
      message.error(error.message || "Không thể cập nhật. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: "Tên khóa học",
      dataIndex: "title",
      key: "title",
      render: (text) => <Text strong>{text}</Text>,
      width: "30%",
    },
    {
      title: "Giá",
      dataIndex: "price",
      key: "price",
      width: "20%",
      render: (text, record) => {
        const isEditing = record.id === editingId;
        return isEditing ? (
          <Form.Item
            name="price"
            rules={[
              {
                required: true,
                message: "Vui lòng nhập giá!",
              },
            ]}
            style={{ margin: 0 }}
          >
            <InputNumber
              min={0}
              formatter={(value) => formatPrice(value)}
              parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
              style={{ width: '100%' }}
            />
          </Form.Item>
        ) : (
          <Text>{formatPrice(text)} VNĐ</Text>
        );
      },
    },
    {
      title: "Giáo viên",
      dataIndex: "teacher",
      key: "teacher",
      width: "20%",
      render: (text, record) => {
        const isEditing = record.id === editingId;
        return isEditing ? (
          <Form.Item
            name="teacher"
            rules={[
              {
                required: true,
                message: "Vui lòng nhập tên giáo viên!",
              },
            ]}
            style={{ margin: 0 }}
          >
            <Input />
          </Form.Item>
        ) : (
          <Text>{text || "Chưa có thông tin"}</Text>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: "30%",
      align: "center",
      render: (_, record) => {
        const isEditing = record.id === editingId;
        return isEditing ? (
          <Space size="small">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => saveEdit(record)}
            >
              Lưu
            </Button>
            <Button
              icon={<CloseOutlined />}
              onClick={cancelEditing}
            >
              Hủy
            </Button>
          </Space>
        ) : (
          <Space size="small">
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => startEditing(record)}
            >
              Sửa nhanh
            </Button>
            <Link href={`/edit-course/${record.id}`}>
              <Button type="default" icon={<EditOutlined />}>
                Chi tiết
              </Button>
            </Link>
            <Button
              type="primary"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id, record.title)}
            >
              Xóa
            </Button>
          </Space>
        );
      },
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
              placeholder="Tìm kiếm theo tên, giá, giáo viên..."
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

        <Form form={form} component={false}>
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
        </Form>
      </Card>
    </Content>
  );
}
