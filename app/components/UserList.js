"use client";
import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { Table, Space, Button, Tag, Modal, message, InputNumber, Card, Switch, Select, DatePicker } from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  WalletOutlined,
  CrownOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import 'dayjs/locale/vi';

// Cài đặt plugins cho dayjs
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale('vi'); // Sử dụng tiếng Việt

// Thiết lập múi giờ Việt Nam
dayjs.tz.setDefault("Asia/Ho_Chi_Minh");

// Hàm tiện ích xử lý thời gian
const dateTimeUtils = {
  // Định dạng thời gian nhất quán
  formatDateTime: (date, format = 'HH:mm DD/MM/YYYY') => {
    if (!date) return '';
    return dayjs(date).tz("Asia/Ho_Chi_Minh").format(format);
  },
  
  // Thời gian tương đối (vd: 5 phút trước, 2 giờ nữa)
  fromNow: (date) => {
    if (!date) return '';
    return dayjs(date).tz("Asia/Ho_Chi_Minh").fromNow();
  },
  
  // Định dạng thời gian hết hạn VIP
  formatExpiryTime: (expiryDate) => {
    if (!expiryDate) return '';
    
    const expiryDateObj = dayjs(expiryDate).tz("Asia/Ho_Chi_Minh");
    const now = dayjs().tz("Asia/Ho_Chi_Minh");
    
    // Tính khoảng cách thời gian (giờ)
    const hoursDiff = expiryDateObj.diff(now, 'hour');
    const minutesDiff = expiryDateObj.diff(now, 'minute');
    
    // Hiển thị chi tiết nếu sắp hết hạn
    if (hoursDiff < 24) {
      // Nếu sắp hết hạn trong vòng 1 giờ, hiển thị số phút
      if (hoursDiff < 1) {
        return `${expiryDateObj.format('HH:mm DD/MM/YYYY')} (còn ${minutesDiff} phút)`;
      }
      return `${expiryDateObj.format('HH:mm DD/MM/YYYY')} (còn ${hoursDiff} giờ)`;
    }
    
    // Tính số ngày còn lại
    const daysDiff = expiryDateObj.diff(now, 'day');
    if (daysDiff < 7) {
      return `${expiryDateObj.format('DD/MM/YYYY')} (còn ${daysDiff} ngày)`;
    }
    
    return expiryDateObj.format('DD/MM/YYYY');
  },
  
  // Tính thời gian còn lại của VIP để chọn thời hạn phù hợp khi sửa
  calculateRemainingDuration: (expiryDate) => {
    if (!expiryDate) return 30;
    
    const expiryDateObj = dayjs(expiryDate).tz("Asia/Ho_Chi_Minh");
    const now = dayjs().tz("Asia/Ho_Chi_Minh");
    
    // Tính số ngày còn lại
    const daysRemaining = expiryDateObj.diff(now, 'day', true);
    
    if (daysRemaining <= 1) {
      // Nếu còn ít hơn 1 ngày, trả về giá trị phù hợp với option 1 giờ hoặc 1 ngày
      return daysRemaining <= 0.05 ? 0.04 : 1;
    } else if (daysRemaining <= 7) {
      return 7;
    } else if (daysRemaining <= 30) {
      return 30;
    } else if (daysRemaining <= 90) {
      return 90;
    } else if (daysRemaining <= 180) {
      return 180;
    } else {
      return 365;
    }
  },
  
  // Tạo ngày hết hạn mới dựa trên thời hạn
  calculateExpiryDate: (duration) => {
    const now = dayjs().tz("Asia/Ho_Chi_Minh");
    
    if (duration < 1) {
      // Tính theo giờ
      return now.add(Math.floor(duration * 24), 'hour');
    } else {
      // Tính theo ngày
      return now.add(Math.floor(duration), 'day');
    }
  }
};

import AddUserModal from "./AddUserModal";
import EditUserModal from "./EditUserModal";

const { Option } = Select;

const UserList = forwardRef(({ searchQuery }, ref) => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [depositAmount, setDepositAmount] = useState(0);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showVipModal, setShowVipModal] = useState(false);
  const [isVip, setIsVip] = useState(false);
  const [vipDuration, setVipDuration] = useState(30);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    searchUsers: (query) => handleSearch(query),
    refreshUsers: () => fetchUsers()
  }));

  const fetchUsers = async () => {
    try {
      const response = await fetch("/api/users");
      if (!response.ok) {
        throw new Error("Không thể tải danh sách người dùng");
      }
      const data = await response.json();
      setUsers(data.users);
      setFilteredUsers(data.users);
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

  // Xử lý tìm kiếm
  const handleSearch = (query) => {
    if (!query || query.trim() === '') {
      setFilteredUsers(users);
      return;
    }
    
    const lowercasedQuery = query.toLowerCase().trim();
    const results = users.filter(user => 
      (user.fullName && user.fullName.toLowerCase().includes(lowercasedQuery)) || 
      (user.email && user.email.toLowerCase().includes(lowercasedQuery)) || 
      (user.phoneNumber && user.phoneNumber.toLowerCase().includes(lowercasedQuery))
    );
    
    setFilteredUsers(results);
  };

  // Thực hiện tìm kiếm khi searchQuery thay đổi từ component cha
  useEffect(() => {
    if (searchQuery !== undefined) {
      handleSearch(searchQuery);
    }
  }, [searchQuery, users]);

  const handleAddUser = (newUser) => {
    const updatedUsers = [...users, newUser];
    setUsers(updatedUsers);
    setFilteredUsers(updatedUsers);
  };

  const handleEditUser = (updatedUser) => {
    const updatedUsers = users.map((user) => 
      user.id === updatedUser.id ? updatedUser : user
    );
    setUsers(updatedUsers);
    setFilteredUsers(handleSearch(searchQuery) || updatedUsers);
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

          const updatedUsers = users.filter((user) => user.id !== userId);
          setUsers(updatedUsers);
          setFilteredUsers(updatedUsers);
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
      const updatedUsers = users.map((user) =>
        user.id === selectedUser.id ? { ...user, balance } : user
      );
      
      setUsers(updatedUsers);
      setFilteredUsers(updatedUsers);

      message.success("Nạp tiền thành công");
      setShowDepositModal(false);
      setDepositAmount(0);
    } catch (error) {
      console.error("Lỗi khi nạp tiền:", error);
      message.error(error.message);
    }
  };

  // Kiểm tra VIP hết hạn
  const checkExpiredVips = async () => {
    try {
      const response = await fetch("/api/users/check-expired-vips");
      if (!response.ok) {
        throw new Error("Không thể kiểm tra VIP hết hạn");
      }
      const data = await response.json();
      if (data.updated && data.updated > 0) {
        // Nếu có VIP hết hạn, cập nhật lại danh sách
        fetchUsers();
        message.info({
          content: (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <ClockCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />
              <span>Đã cập nhật {data.updated} tài khoản VIP hết hạn</span>
            </div>
          ),
          icon: null
        });
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra VIP hết hạn:", error);
    }
  };

  useEffect(() => {
    // Kiểm tra VIP hết hạn khi component mount
    checkExpiredVips();
    
    // Thiết lập kiểm tra định kỳ mỗi phút
    const interval = setInterval(checkExpiredVips, 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const handleToggleVip = async () => {
    try {
      const response = await fetch("/api/users/toggle-vip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          isVip: isVip,
          duration: isVip ? vipDuration : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Không thể thay đổi trạng thái VIP");
      }

      const { isVip: updatedIsVip, vipExpiresAt } = await response.json();

      // Cập nhật danh sách users với trạng thái VIP mới
      const updatedUsers = users.map((user) =>
        user.id === selectedUser.id ? { 
          ...user, 
          isVip: updatedIsVip,
          vipExpiresAt: vipExpiresAt 
        } : user
      );
      
      setUsers(updatedUsers);
      setFilteredUsers(updatedUsers);

      if (updatedIsVip) {
        message.success({
          content: (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <CrownOutlined style={{ color: '#faad14', marginRight: 8 }} />
              <span>Đã bật VIP cho <strong>{selectedUser.fullName}</strong> đến {dateTimeUtils.formatExpiryTime(vipExpiresAt)}</span>
            </div>
          ),
          icon: null
        });
      } else {
        message.success({
          content: (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <CrownOutlined style={{ marginRight: 8 }} />
              <span>Đã tắt VIP cho <strong>{selectedUser.fullName}</strong></span>
            </div>
          ),
          icon: null
        });
      }
      
      setShowVipModal(false);
    } catch (error) {
      console.error("Lỗi khi thay đổi trạng thái VIP:", error);
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
      title: "VIP",
      dataIndex: "isVip",
      key: "isVip",
      render: (isVip, record) => (
        <Space direction="vertical" size={0}>
          <Tag color={isVip ? "gold" : "default"} icon={isVip ? <CrownOutlined /> : null} style={{ fontWeight: 500 }}>
            {isVip ? "VIP" : "Thường"}
          </Tag>
          {isVip && record.vipExpiresAt && (
            <span style={{ fontSize: '12px', color: '#999' }}>
              <ClockCircleOutlined style={{ marginRight: 2 }} /> 
              {dateTimeUtils.formatExpiryTime(record.vipExpiresAt)}
            </span>
          )}
        </Space>
      ),
      filters: [
        { text: "VIP", value: true },
        { text: "Thường", value: false },
      ],
      onFilter: (value, record) => record.isVip === value,
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
            icon={<CrownOutlined />}
            style={{ 
              color: user.isVip ? '#faad14' : undefined, 
              borderColor: user.isVip ? '#faad14' : undefined,
              background: user.isVip ? '#fffbe6' : undefined
            }}
            onClick={() => {
              setSelectedUser(user);
              setIsVip(user.isVip || false);
              setVipDuration(user.isVip ? dateTimeUtils.calculateRemainingDuration(user.vipExpiresAt) : 30);
              setShowVipModal(true);
            }}
          >
            VIP
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
    <Card className="shadow-sm">
      <Table
        columns={columns}
        dataSource={filteredUsers}
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
              value={depositAmount}
              onChange={(value) => setDepositAmount(value)}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <CrownOutlined style={{ color: '#faad14', marginRight: 8, fontSize: 20 }} />
            <span>Quản lý VIP</span>
          </div>
        }
        open={showVipModal}
        onCancel={() => {
          setShowVipModal(false);
          setSelectedUser(null);
        }}
        onOk={handleToggleVip}
        okText="Xác nhận"
        cancelText="Hủy"
      >
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-md">
            <p className="font-medium">Người dùng: {selectedUser?.fullName}</p>
            <p>
              Trạng thái hiện tại: 
              <Tag 
                color={selectedUser?.isVip ? "gold" : "default"} 
                icon={selectedUser?.isVip ? <CrownOutlined /> : null}
                style={{ marginLeft: 8, fontWeight: 500 }}
              >
                {selectedUser?.isVip ? "VIP" : "Thường"}
              </Tag>
            </p>
            {selectedUser?.isVip && selectedUser?.vipExpiresAt && (
              <p style={{ color: '#666', fontSize: '13px', marginTop: 4 }}>
                <ClockCircleOutlined style={{ marginRight: 5 }} />
                Hết hạn: <span style={{ fontWeight: 500 }}>{dateTimeUtils.formatExpiryTime(selectedUser.vipExpiresAt)}</span>
              </p>
            )}
          </div>
          
          <div className="mt-6">
            <p className="font-medium mb-2">Cập nhật trạng thái VIP:</p>
            <div className="flex items-center gap-2 mb-4">
              <Switch 
                checked={isVip} 
                onChange={setIsVip} 
                checkedChildren={<><CrownOutlined /> VIP</>} 
                unCheckedChildren="Thường"
                style={{ width: 70 }}
              />
              <span className="text-sm text-gray-500 ml-2">
                {isVip ? "Bật" : "Tắt"} VIP cho người dùng này
              </span>
            </div>
            
            {isVip && (
              <div className="mt-4 p-3 bg-gray-50 rounded-md">
                <p className="font-medium mb-2">Thời hạn VIP:</p>
                <div className="flex items-center gap-2 mt-2">
                  <Select
                    style={{ width: 120 }}
                    value={vipDuration}
                    onChange={(value) => setVipDuration(value)}
                  >
                    <Option value={0.04}>1 giờ</Option>
                    <Option value={1}>1 ngày</Option>
                    <Option value={7}>7 ngày</Option>
                    <Option value={30}>30 ngày</Option>
                    <Option value={90}>3 tháng</Option>
                    <Option value={180}>6 tháng</Option>
                    <Option value={365}>1 năm</Option>
                  </Select>
                  <span className="text-gray-500">
                    ~ Đến <span className="font-medium">{dateTimeUtils.formatDateTime(
                      dateTimeUtils.calculateExpiryDate(vipDuration),
                      vipDuration < 1 ? 'HH:mm DD/MM/YYYY' : 'DD/MM/YYYY'
                    )}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </Card>
  );
});

UserList.displayName = "UserList";

export default UserList;
