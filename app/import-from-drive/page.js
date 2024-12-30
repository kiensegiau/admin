"use client";
import { useState, useEffect } from "react";
import { Layout, Typography, Alert, message, Button, Card, Spin } from "antd";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import GoogleDriveFolderSelector from "../components/GoogleDriveFolderSelector";
import { checkAuthStatus, getGoogleAuthUrl } from "@/lib/auth";

const { Content } = Layout;
const { Title } = Typography;

export default function ImportFromDrive() {
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [accessToken, setAccessToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const verifyAuth = async () => {
      setIsLoading(true);
      console.log("Bắt đầu kiểm tra xác thực...");

      try {
        const { isAuthenticated, user, error } = await checkAuthStatus();
        console.log("Kết quả xác thực:", { isAuthenticated, user, error });

        if (!isAuthenticated) {
          console.log("Chưa xác thực, chuyển hướng...");
          const authUrl = await getGoogleAuthUrl();
          if (authUrl) {
            window.location.href = authUrl;
            return;
          }
          throw new Error("Không lấy được URL đăng nhập");
        }

        console.log("Xác thực thành công");
        setIsConnected(true);
      } catch (error) {
        console.error("Lỗi:", error);
        message.error("Có lỗi xảy ra khi kiểm tra xác thực");
        setIsConnected(false);
      } finally {
        setIsLoading(false);
      }
    };

    verifyAuth();
  }, []);

  const handleFolderSelect = (folderId, folderName) => {
    setSelectedFolder({ id: folderId, name: folderName });
    message.success(`Đã chọn thư mục: ${folderName}`);
  };

  const handleImport = async () => {
    if (!selectedFolder) {
      message.warning("Vui lòng chọn thư mục trước khi import.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("folderId", selectedFolder.id);
      formData.append("courseId", "new");

      const response = await fetch("/api/import-course-from-drive", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        try {
          const data = JSON.parse(chunk.replace("data: ", ""));
          if (data.folderStructure) {
            console.log("Cấu trúc thư mục:", data.folderStructure);
          } else {
            console.log("Nhận được chunk:", data);
          }
        } catch (error) {
          console.error("Lỗi khi phân tích JSON:", error);
        }
      }

      message.success("Import khóa học thành công!");
    } catch (error) {
      console.error("Lỗi khi import khóa học:", error);
      message.error("Có lỗi xảy ra khi import khóa học");
    }
  };

  if (isLoading) {
    return (
      <Layout className="min-h-screen">
        <Layout>
          <Header />
          <Content className="p-6">
            <Card className="w-full max-w-3xl mx-auto">
              <div className="text-center">
                <Spin size="large" />
                <p className="mt-4">Đang kiểm tra trạng thái xác thực...</p>
              </div>
            </Card>
          </Content>
        </Layout>
      </Layout>
    );
  }

  return (
    <Layout className="min-h-screen">
      <Layout>
        <Header />
        <Content className="p-6">
          <Card className="w-full max-w-3xl mx-auto">
            <Title level={2} className="mb-6">
              Import từ Google Drive
            </Title>
            {isConnected ? (
              <>
                <GoogleDriveFolderSelector onSelect={handleFolderSelect} />
                {selectedFolder && (
                  <div className="mt-6">
                    <Alert
                      message={`Thư mục đã chọn: ${selectedFolder.name}`}
                      type="info"
                      showIcon
                      className="mb-4"
                    />
                    <Button type="primary" onClick={handleImport} size="large">
                      Import Khóa học
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <Alert
                message="Chưa kết nối với Google Drive"
                description="Vui lòng kết nối với Google Drive trước khi import."
                type="warning"
                showIcon
              />
            )}
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}
