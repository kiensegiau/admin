"use client";

import { useState } from "react";
import { Form, Input, InputNumber, Upload, Select, Button } from "antd";
import { UploadOutlined, SaveOutlined } from "@ant-design/icons";
import { addDoc, collection } from "firebase/firestore";
import { db } from "../firebase";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

const ReactQuill = dynamic(() => import("react-quill"), {
  ssr: false,
  loading: () => <p>Loading editor...</p>,
});
import "react-quill/dist/quill.snow.css";

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

export default function CourseForm() {
  const [form] = Form.useForm();
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const onFinish = async (values) => {
    try {
      setIsSubmitting(true);
      const courseData = {
        ...values,
        description,
        coverImage: coverImage || "",
        chapters: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await addDoc(collection(db, "courses"), courseData);
      toast.success("Khóa học đã được thêm thành công");
      router.push("/courses");
    } catch (error) {
      console.error("Lỗi:", error);
      toast.error("Có lỗi xảy ra khi thêm khóa học");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = async ({ file, onSuccess, onError }) => {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setCoverImage(data.url);
      onSuccess("Ok");
      toast.success("Tải ảnh lên thành công");
    } catch (error) {
      console.error("Lỗi khi tải ảnh lên:", error);
      onError({ error });
      toast.error("Lỗi khi tải ảnh lên");
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={onFinish}
      className="space-y-6"
      initialValues={{
        title: "",
        price: 0,
        teacher: "",
        subject: "math",
        grade: "grade10",
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Form.Item
          name="title"
          label="Tiêu đề khóa học"
          rules={[
            { required: true, message: "Vui lòng nhập tiêu đề khóa học" },
          ]}
        >
          <Input placeholder="Nhập tiêu đề khóa học" size="large" />
        </Form.Item>

        <Form.Item
          name="teacher"
          label="Giảng viên"
          rules={[{ required: true, message: "Vui lòng nhập tên giảng viên" }]}
        >
          <Input placeholder="Tên giảng viên" size="large" />
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
            size="large"
            min={0}
          />
        </Form.Item>

        <Form.Item
          name="subject"
          label="Môn học"
          rules={[{ required: true, message: "Vui lòng chọn môn học" }]}
        >
          <Select options={SUBJECTS} size="large" />
        </Form.Item>

        <Form.Item
          name="grade"
          label="Lớp"
          rules={[{ required: true, message: "Vui lòng chọn lớp" }]}
        >
          <Select options={GRADES} size="large" />
        </Form.Item>

        <Form.Item label="Ảnh bìa">
          <Upload
            customRequest={handleImageUpload}
            maxCount={1}
            listType="picture"
            accept="image/*"
            showUploadList={{ showRemoveIcon: true }}
          >
            <Button icon={<UploadOutlined />}>Tải ảnh lên</Button>
          </Upload>
        </Form.Item>
      </div>

      <Form.Item
        label="Mô tả chi tiết"
        rules={[{ required: true, message: "Vui lòng nhập mô tả khóa học" }]}
      >
        <ReactQuill
          theme="snow"
          value={description}
          onChange={setDescription}
          className="h-48"
          modules={{
            toolbar: [
              [{ header: [1, 2, 3, false] }],
              ["bold", "italic", "underline", "strike"],
              [{ list: "ordered" }, { list: "bullet" }],
              ["link", "image"],
              ["clean"],
            ],
          }}
        />
      </Form.Item>

      <div className="flex justify-end">
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          icon={<SaveOutlined />}
          loading={isSubmitting}
        >
          Tạo khóa học
        </Button>
      </div>
    </Form>
  );
}
