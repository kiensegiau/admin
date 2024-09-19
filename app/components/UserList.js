'use client';
import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import Modal from './Modal';
import { getAuth, deleteUser as deleteAuthUser } from 'firebase/auth';
import AddUserModal from './AddUserModal';

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    console.log('Users after fetch:', users);
  }, [users]);

  const fetchUsers = async () => {
    try {
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      const userList = querySnapshot.docs.map(doc => {
        const userData = { id: doc.id, ...doc.data() };
        console.log('User data:', userData);
        return userData;
      });
      setUsers(userList);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách người dùng:", error);
      toast.error("Không thể tải danh sách người dùng");
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, { isActive: !currentStatus });
      setUsers(users.map(user => 
        user.id === userId ? {...user, isActive: !currentStatus} : user
      ));
      toast.success(`Người dùng đã được ${currentStatus ? 'khóa' : 'mở khóa'}`);
      if (selectedUser && selectedUser.id === userId) {
        setSelectedUser({...selectedUser, isActive: !currentStatus});
      }
    } catch (error) {
      console.error("Lỗi khi cập nhật trạng thái người dùng:", error);
      toast.error("Không thể cập nhật trạng thái người dùng");
    }
  };

  const deleteUser = async (userId) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa người dùng này?")) {
      try {
        console.log('Đang gửi yêu cầu xóa người dùng:', userId);
        const response = await fetch('/api/deleteUser', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        });

        console.log('Nhận được phản hồi:', response);

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Lỗi khi xóa người dùng');
        }

        setUsers(users.filter(user => user.id !== userId));
        toast.success("Người dùng đã được xóa");
      } catch (error) {
        console.error("Lỗi chi tiết khi xóa người dùng:", error);
        toast.error("Không thể xóa người dùng: " + error.message);
      }
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setIsModalOpen(true);
  };

  const openUserModal = (user) => {
    const fullUserData = {...user, phoneNumber: user.phoneNumber || ''};
    setSelectedUser(fullUserData);
    setIsModalOpen(true);
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = (
      (user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (user.email?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
    );
    if (filter === 'all') return matchesSearch;
    if (filter === 'active') return matchesSearch && user.isActive === true;
    if (filter === 'inactive') return matchesSearch && user.isActive === false;
    return matchesSearch;
  });

  const handleAddUser = (newUser) => {
    setUsers([...users, newUser]);
  };

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <div>
          <input
            type="text"
            placeholder="Tìm kiếm người dùng..."
            className="p-2 border rounded"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select
            className="p-2 border rounded ml-2"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Tất cả</option>
            <option value="active">Đang hoạt động</option>
            <option value="inactive">Đã khóa</option>
          </select>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
        >
          Thêm người dùng
        </button>
      </div>
      {loading ? (
        <p>Đang tải...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white">
            <thead>
              <tr>
                <th className="px-6 py-3 border-b-2 border-gray-300 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Tên</th>
                <th className="px-6 py-3 border-b-2 border-gray-300 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 border-b-2 border-gray-300 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Trạng thái</th>
                <th className="px-6 py-3 border-b-2 border-gray-300 text-left text-xs leading-4 font-medium text-gray-500 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-no-wrap border-b border-gray-500">
                    <div className="text-sm leading-5 font-medium text-gray-900">{user.fullName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-no-wrap border-b border-gray-500">
                    <div className="text-sm leading-5 text-gray-900">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-no-wrap border-b border-gray-500">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {user.isActive !== false ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-no-wrap border-b border-gray-500 text-sm leading-5 font-medium">
                    <button onClick={() => openUserModal(user)} className="text-indigo-600 hover:text-indigo-900">
                      Xem chi tiết
                    </button>
                    <button onClick={() => deleteUser(user.id)} className="text-red-600 hover:text-red-900 ml-4">Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          user={selectedUser}
          onSave={(updatedUser) => {
            setUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u));
            setIsModalOpen(false);
          }}
        />
      )}
      <AddUserModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddUser={handleAddUser}
      />
    </div>
  );
}