import { useState } from "react";
import { Modal, Form, Input, Button, Select } from "antd";
import { toast } from "sonner";

const { Option } = Select;

export default function AddUserModal({ open, onCancel, onSuccess }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      
      // Tạo một bản sao của values để xử lý
      let formattedValues = { ...values };
      
      // Xử lý số điện thoại
      if (values.phoneNumber && values.phoneNumber.trim()) {
        // Đảm bảo số điện thoại có định dạng +[country code][number]
        const phoneNumber = values.phoneNumber.trim();
        if (!phoneNumber.startsWith('+')) {
          // Mặc định thêm mã quốc gia Việt Nam (+84) nếu số bắt đầu bằng 0
          if (phoneNumber.startsWith('0')) {
            formattedValues.phoneNumber = '+84' + phoneNumber.substring(1);
          } else {
            formattedValues.phoneNumber = '+84' + phoneNumber;
          }
        }
      } else {
        // Nếu không có số điện thoại, xóa trường này khỏi object
        delete formattedValues.phoneNumber;
      }
      
      const response = await fetch("/api/users/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formattedValues),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra");
      }

      onSuccess(data.user);
      toast.success("Người dùng mới đã được thêm");
      form.resetFields();
      onCancel();
    } catch (error) {
      console.error("Lỗi khi thêm người dùng:", error);
      toast.error(error.message || "Không thể thêm người dùng mới");
    } finally {
      setLoading(false);
    }
  };
  
  const prefixSelector = (
    <Form.Item name="prefix" noStyle initialValue="+84">
      <Select style={{ width: 80 }}>
        <Option value="+84">+84</Option>
        <Option value="+1">+1</Option>
        <Option value="+65">+65</Option>
        <Option value="+81">+81</Option>
      </Select>
    </Form.Item>
  );

  return (
    <Modal
      title="Thêm người dùng mới"
      open={open}
      onCancel={onCancel}
      footer={null}
      maskClosable={false}
    >
      <Form 
        form={form}
        layout="vertical" 
        onFinish={handleSubmit}
      >
        <Form.Item
          name="fullName"
          label="Tên đầy đủ"
          rules={[{ required: true, message: "Vui lòng nhập tên đầy đủ" }]}
        >
          <Input placeholder="Nhập tên đầy đủ" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: "Vui lòng nhập email" },
            { type: "email", message: "Email không hợp lệ" }
          ]}
        >
          <Input placeholder="Nhập email" />
        </Form.Item>

        <Form.Item
          name="phoneNumber"
          label="Số điện thoại (không bắt buộc)"
          rules={[
            { 
              validator: (_, value) => {
                if (!value || value.trim() === '') {
                  return Promise.resolve();
                }
                if (/^(\+\d{1,3})?\d{9,12}$/.test(value)) {
                  return Promise.resolve();
                }
                return Promise.reject('Định dạng số điện thoại không hợp lệ');
              }
            }
          ]}
        >
          <Input 
            addonBefore={prefixSelector}
            placeholder="Nhập số điện thoại (không cần số 0 đầu)"
            allowClear
          />
        </Form.Item>

        <Form.Item
          name="password"
          label="Mật khẩu"
          rules={[{ required: true, message: "Vui lòng nhập mật khẩu" }]}
        >
          <Input.Password placeholder="Nhập mật khẩu" />
        </Form.Item>

        <Form.Item className="flex justify-end">
          <Button type="default" onClick={onCancel} style={{ marginRight: 8 }}>
            Hủy
          </Button>
          <Button type="primary" htmlType="submit" loading={loading}>
            Thêm người dùng
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
}
