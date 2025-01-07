"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { Modal, Spin, Form, Input, InputNumber, Select } from "antd";

const ReactQuill = dynamic(() => import("react-quill"), {
  ssr: false,
  loading: () => <p>Loading editor...</p>,
});

const SUBJECTS = [
  { value: "math", label: "Toán học" },
  { value: "physics", label: "Vật lý" },
  { value: "chemistry", label: "Hóa học" },
  { value: "biology", label: "Sinh học" },
  { value: "literature", label: "Ngữ văn" },
  { value: "english", label: "Tiếng Anh" },
  { value: "history", label: "Lịch sử" },
  { value: "geography", label: "Địa lý" },
  { value: "informatics", label: "Tin học" },
];

const GRADES = [
  { value: "grade6", label: "Lớp 6" },
  { value: "grade7", label: "Lớp 7" },
  { value: "grade8", label: "Lớp 8" },
  { value: "grade9", label: "Lớp 9" },
  { value: "grade10", label: "Lớp 10" },
  { value: "grade11", label: "Lớp 11" },
  { value: "grade12", label: "Lớp 12" },
];

export default function EditCourseInfoModal({
  course,
  onClose,
  onUpdateCourse,
  isVisible,
}) {
  const [form] = Form.useForm();
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    import("react-quill/dist/quill.snow.css");
  }, []);

  useEffect(() => {
    if (course && isVisible) {
      form.setFieldsValue({
        title: course.title || "",
        teacher: course.teacher || "",
        price: course.price || 0,
        description: course.description || "",
        coverImage: course.coverImage || "",
        subject: course.subject || "math",
        grade: course.grade || "grade10",
      });
    }
  }, [course, isVisible, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await onUpdateCourse({
        ...values,
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (error) {
      console.error("Lỗi khi cập nhật thông tin khóa học:", error);
      toast.error("Không thể cập nhật thông tin khóa học");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file hình ảnh");
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      form.setFieldValue("coverImage", data.url);
      toast.success("Đã tải lên ảnh thành công");
    } catch (error) {
      console.error("Lỗi khi tải lên ảnh:", error);
      toast.error("Không thể tải lên ảnh");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal
      title="Chỉnh sửa thông tin khóa học"
      open={isVisible}
      onOk={handleSubmit}
      onCancel={onClose}
      width={800}
      okText="Cập nhật"
      cancelText="Hủy"
      confirmLoading={isUploading}
    >
      <Form form={form} layout="vertical" initialValues={course}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Form.Item
            name="title"
            label="Tên khóa học"
            rules={[{ required: true, message: "Vui lòng nhập tên khóa học" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="teacher"
            label="Giáo viên"
            rules={[{ required: true, message: "Vui lòng nhập tên giáo viên" }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="price"
            label="Giá (VNĐ)"
            rules={[{ required: true, message: "Vui lòng nhập giá khóa học" }]}
          >
            <InputNumber
              className="w-full"
              formatter={(value) =>
                `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
              }
              parser={(value) => value.replace(/\$\s?|(,*)/g, "")}
              min={0}
            />
          </Form.Item>

          <Form.Item
            name="subject"
            label="Môn học"
            rules={[{ required: true, message: "Vui lòng chọn môn học" }]}
          >
            <Select options={SUBJECTS} />
          </Form.Item>

          <Form.Item
            name="grade"
            label="Lớp"
            rules={[{ required: true, message: "Vui lòng chọn lớp" }]}
          >
            <Select options={GRADES} />
          </Form.Item>

          <Form.Item label="Ảnh nền" name="coverImage">
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="w-full"
                disabled={isUploading}
              />
              {isUploading && (
                <div className="flex items-center justify-center p-4 bg-gray-50 rounded">
                  <Spin tip="Đang tải lên..." />
                </div>
              )}
              {form.getFieldValue("coverImage") && (
                <img
                  src={form.getFieldValue("coverImage")}
                  alt="Cover preview"
                  className="mt-2 max-h-40 object-cover rounded"
                />
              )}
            </div>
          </Form.Item>
        </div>

        <Form.Item
          name="description"
          label="Mô tả khóa học"
          rules={[{ required: true, message: "Vui lòng nhập mô tả khóa học" }]}
        >
          <ReactQuill theme="snow" className="h-40" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
