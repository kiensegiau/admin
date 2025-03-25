"use client";

import { useState } from "react";
import { Button, Input, message, Layout, Typography, Card, Table, Tag, Space, Progress } from "antd";
import { CloudUploadOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import Header from "../components/Header";

const { Content } = Layout;
const { Title, Text } = Typography;
const { TextArea } = Input;

export default function ImportFromDriveSimple() {
  const [driveUrls, setDriveUrls] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImport = async () => {
    if (!driveUrls.trim()) {
      message.warning("Vui lòng nhập ít nhất một link Google Drive");
      return;
    }

    // Tách các URL riêng biệt (mỗi URL trên một dòng hoặc ngăn cách bởi dấu phẩy)
    const urls = driveUrls
      .split(/[\n,]/)
      .map(url => url.trim())
      .filter(url => url.length > 0);

    if (urls.length === 0) {
      message.warning("Không tìm thấy URL hợp lệ");
      return;
    }

    setIsLoading(true);
    setIsProcessing(true);
    
    // Khởi tạo kết quả cho mỗi URL
    const initialResults = urls.map(url => ({
      url,
      status: "pending",
      message: "Đang xử lý...",
      progress: 0,
      courseData: null,
    }));
    
    setResults(initialResults);

    try {
      // Xử lý song song các URL
      const importPromises = urls.map(async (url, index) => {
        try {
          // Cập nhật trạng thái thành "đang xử lý"
          setResults(prev => {
            const updatedResults = [...prev];
            updatedResults[index] = {
              ...updatedResults[index],
              status: "processing",
              progress: 10,
            };
            return updatedResults;
          });

          const response = await fetch("/api/import-course-from-drive", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ driveUrl: url }),
          });

          // Cập nhật tiến độ
          setResults(prev => {
            const updatedResults = [...prev];
            updatedResults[index] = {
              ...updatedResults[index],
              progress: 50,
            };
            return updatedResults;
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Lỗi khi import khóa học");
          }

          const data = await response.json();

          // Xử lý dữ liệu trả về
          const courseData = {
            title: data.title,
            description: `Khóa học được import từ Google Drive\n\nCấu trúc khóa học:\n${formatStructure(
              data.structure
            )}`,
          };

          // Cập nhật kết quả thành công
          setResults(prev => {
            const updatedResults = [...prev];
            updatedResults[index] = {
              ...updatedResults[index],
              status: "success",
              progress: 100,
              message: "Import thành công",
              courseData,
            };
            return updatedResults;
          });

          return { status: "success", url, courseData };
        } catch (error) {
          // Cập nhật kết quả thất bại
          setResults(prev => {
            const updatedResults = [...prev];
            updatedResults[index] = {
              ...updatedResults[index],
              status: "error",
              progress: 100,
              message: error.message || "Lỗi khi import khóa học",
            };
            return updatedResults;
          });
          
          return { status: "error", url, error: error.message };
        }
      });

      // Đợi tất cả các promies hoàn thành
      await Promise.all(importPromises);

      // Đếm số lượng thành công và thất bại
      const successCount = results.filter(r => r.status === "success").length;
      const errorCount = results.filter(r => r.status === "error").length;
      
      if (successCount > 0) {
        message.success(`Đã import thành công ${successCount} khóa học`);
      }
      
      if (errorCount > 0) {
        message.error(`Có ${errorCount} khóa học gặp lỗi khi import`);
      }

    } catch (error) {
      console.error("Lỗi:", error);
      message.error("Có lỗi xảy ra khi xử lý các yêu cầu");
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  // Hàm format cấu trúc thư mục thành text
  const formatStructure = (structure, level = 0) => {
    if (!structure) return "";
    
    const indent = "  ".repeat(level);
    let result = `${indent}${structure.name}\n`;

    if (structure.children) {
      structure.children.forEach((child) => {
        if (child.type === "folder") {
          result += formatStructure(child, level + 1);
        } else {
          result += `${indent}  - ${child.name}\n`;
        }
      });
    }

    return result;
  };

  // Cột cho bảng kết quả
  const columns = [
    {
      title: 'URL',
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
      width: '40%',
      render: (text) => <Text ellipsis>{text}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: '20%',
      render: (status) => {
        if (status === 'success') {
          return <Tag icon={<CheckCircleOutlined />} color="success">Thành công</Tag>;
        } else if (status === 'error') {
          return <Tag icon={<CloseCircleOutlined />} color="error">Lỗi</Tag>;
        } else if (status === 'processing') {
          return <Tag icon={<LoadingOutlined />} color="processing">Đang xử lý</Tag>;
        }
        return <Tag color="default">Chờ xử lý</Tag>;
      },
    },
    {
      title: 'Tiến trình',
      dataIndex: 'progress',
      key: 'progress',
      width: '20%',
      render: (progress) => <Progress percent={progress} size="small" />,
    },
    {
      title: 'Thông báo',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      width: '20%',
    },
  ];

  return (
    <Layout className="min-h-screen">
      <Layout>
        <Header />
        <Content className="p-6">
          <Card className="w-full max-w-4xl mx-auto">
            <Title level={2} className="mb-6">
              Import nhiều khóa học từ Google Drive
            </Title>
            
            <div className="mb-4">
              <p className="mb-2">Nhập các link Google Drive (mỗi link một dòng):</p>
              <TextArea
                placeholder="https://drive.google.com/...\nhttps://drive.google.com/..."
                value={driveUrls}
                onChange={(e) => setDriveUrls(e.target.value)}
                className="w-full"
                rows={5}
                disabled={isLoading}
              />
            </div>
            
            <div className="text-gray-500 text-sm mb-4">
              <p>Lưu ý:</p>
              <ul className="list-disc pl-4">
                <li>Mỗi link phải là thư mục Google Drive được chia sẻ công khai</li>
                <li>Thư mục nên chứa các file video và tài liệu của khóa học</li>
                <li>Cấu trúc thư mục nên được tổ chức theo chương/bài học</li>
                <li>Các link có thể nhập mỗi link một dòng hoặc phân cách bằng dấu phẩy</li>
              </ul>
            </div>

            <Button
              type="primary"
              icon={<CloudUploadOutlined />}
              onClick={handleImport}
              loading={isLoading}
              className="mt-2 mb-4"
              disabled={isProcessing}
            >
              Import tất cả
            </Button>

            {results.length > 0 && (
              <div className="mt-4">
                <Title level={4} className="mb-2">Kết quả import</Title>
                <Table 
                  dataSource={results} 
                  columns={columns} 
                  rowKey="url"
                  pagination={false}
                  size="small"
                />
              </div>
            )}
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
} 