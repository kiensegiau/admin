"use client";
import { useState, useEffect } from "react";
import { Table, Space, Button, Tag, Modal, message, InputNumber } from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import AddUserModal from "./AddUserModal";
import EditUserModal from "./EditUserModal";

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [showDepositModal, setShowDepositModal] = useState(false);

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      if (!response.ok) {
        throw new Error("Không thể tải danh sách người dùng");
      }
      const data = await response.json();
      setUsers(data.users);
    } catch (error) {
      console.error("Lỗi khi tải danh sách người dùng:", error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = (newUser) => {
    setUsers([...users, newUser]);
  };

  const handleEditUser = (updatedUser) => {
    setUsers(
      users.map((user) => (user.id === updatedUser.id ? updatedUser : user))
    );
  };

  const handleDeleteUser = (userId) => {
    Modal.confirm({
      title: "Xác nhận xóa",
      content: "Bạn có chắc chắn muốn xóa người dùng này?",
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      onOk: async () => {
        try {
          const response = await fetch("/api/users/delete", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ userId }),
          });

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Không thể xóa người dùng");
          }

          setUsers(users.filter((user) => user.id !== userId));
          message.success("Đã xóa người dùng");
        } catch (error) {
          console.error("Lỗi khi xóa người dùng:", error);
          message.error(error.message);
        }
      },
    });
  };

  const handleDeposit = async () => {
    try {
      const response = await fetch("/api/users/deposit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          amount: depositAmount,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Không thể nạp tiền");
      }

      const { balance } = await response.json();

      // Cập nhật danh sách users với số dư mới
      setUsers(
        users.map((user) =>
          user.id === selectedUser.id ? { ...user, balance } : user
        )
      );

      message.success("Nạp tiền thành công");
      setShowDepositModal(false);
      setDepositAmount(0);
    } catch (error) {
      console.error("Lỗi khi nạp tiền:", error);
      message.error(error.message);
    }
  };

  const columns = [
    {
      title: "Tên",
      dataIndex: "fullName",
      key: "fullName",
      sorter: (a, b) => a.fullName.localeCompare(b.fullName),
    },
    {
      title: "Email",
      dataIndex: "email",
      key: "email",
    },
    {
      title: "Số điện thoại",
      dataIndex: "phoneNumber",
      key: "phoneNumber",
      render: (phone) => phone || "N/A",
    },
    {
      title: "Số dư",
      dataIndex: "balance",
      key: "balance",
      render: (balance) => `${balance?.toLocaleString() || 0} VND`,
    },
    {
      title: "Trạng thái",
      dataIndex: "isActive",
      key: "isActive",
      render: (isActive) => (
        <Tag color={isActive ? "success" : "error"}>
          {isActive ? "Hoạt động" : "Không hoạt động"}
        </Tag>
      ),
      filters: [
        { text: "Hoạt động", value: true },
        { text: "Không hoạt động", value: false },
      ],
      onFilter: (value, record) => record.isActive === value,
    },
    {
      title: "Thao tác",
      key: "action",
      render: (_, user) => (
        <Space size="middle">
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedUser(user);
              setShowEditModal(true);
            }}
          />
          <Button
            icon={<WalletOutlined />}
            onClick={() => {
              setSelectedUser(user);
              setShowDepositModal(true);
            }}
          >
            Nạp tiền
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteUser(user.id)}
          />
        </Space>
      ),
    },
  ];

  return (
    <>
      <Table
        columns={columns}
        dataSource={users}
        rowKey="id"
        loading={loading}
        pagination={{
          defaultPageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `Tổng số ${total} người dùng`,
        }}
      />

      {showAddModal && (
        <AddUserModal
          open={showAddModal}
          onCancel={() => setShowAddModal(false)}
          onSuccess={handleAddUser}
        />
      )}

      {showEditModal && selectedUser && (
        <EditUserModal
          open={showEditModal}
          onCancel={() => {
            setShowEditModal(false);
            setSelectedUser(null);
          }}
          user={selectedUser}
          onSuccess={handleEditUser}
        />
      )}

      <Modal
        title="Nạp tiền"
        open={showDepositModal}
        onCancel={() => {
          setShowDepositModal(false);
          setSelectedUser(null);
          setDepositAmount(0);
        }}
        onOk={handleDeposit}
        okText="Xác nhận"
        cancelText="Hủy"
      >
        <div className="space-y-4">
          <div>
            <p>Người dùng: {selectedUser?.fullName}</p>
            <p>
              Số dư hiện tại: {selectedUser?.balance?.toLocaleString() || 0} VND
            </p>
          </div>
          <div>
            <p>Số tiền nạp:</p>
            <InputNumber
              style={{ width: "100%" }}
              min={0}
              step={10000}
              formatter={(value) =>
                `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
              }
              parser={(value) => value.replace(/\$\s?|(,*)/g, "")}
              onChange={(value) => setDepositAmount(value)}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
