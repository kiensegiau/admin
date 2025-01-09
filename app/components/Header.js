"use client";
import { Layout, Button, Dropdown, message } from "antd";
import { UserOutlined, LogoutOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";

const { Header: AntHeader } = Layout;

export default function Header() {
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      const response = await fetch("/api/auth/signout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Không thể đăng xuất");
      }

      router.push("/login");
      message.success("Đăng xuất thành công");
    } catch (error) {
      console.error("Lỗi khi đăng xuất:", error);
      message.error("Không thể đăng xuất");
    }
  };

  const items = [
    {
      key: "logout",
      label: "Đăng xuất",
      icon: <LogoutOutlined />,
      onClick: handleSignOut,
    },
  ];

  return (
    <AntHeader
      style={{
        padding: "0 24px",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        borderBottom: "1px solid #f0f0f0",
      }}
    >
      <Dropdown menu={{ items }} placement="bottomRight">
        <Button type="text" icon={<UserOutlined />}>
          Admin
        </Button>
      </Dropdown>
    </AntHeader>
  );
}
