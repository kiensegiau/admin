'use client';
import { useState } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

export default function Modal({ isOpen, onClose, user, onSave }) {
  const [editedUser, setEditedUser] = useState(user);
  const [isEditing, setIsEditing] = useState(false);

  const handleChange = (e) => {
    setEditedUser({ ...editedUser, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    try {
      const updatedFields = {
        fullName: editedUser.fullName,
        phoneNumber: editedUser.phoneNumber
      };
      await updateDoc(doc(db, 'users', editedUser.id), updatedFields);
      onSave({...editedUser, ...updatedFields});
      setIsEditing(false);
      toast.success('Thông tin người dùng đã được cập nhật');
    } catch (error) {
      console.error('Lỗi khi cập nhật thông tin người dùng:', error);
      toast.error('Không thể cập nhật thông tin người dùng');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full" onClick={onClose}>
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Thông tin người dùng</h3>
        <div className="mt-2">
          <p className="text-sm text-gray-500 mb-2">
            <strong>Tên:</strong> {isEditing ? <input name="fullName" value={editedUser.fullName} onChange={handleChange} className="border rounded px-2 py-1" /> : editedUser.fullName}
          </p>
          <p className="text-sm text-gray-500 mb-2">
            <strong>Email:</strong> {editedUser.email}
          </p>
          <p className="text-sm text-gray-500 mb-2">
            <strong>Số điện thoại:</strong> {isEditing ? <input name="phoneNumber" value={editedUser.phoneNumber || ''} onChange={handleChange} className="border rounded px-2 py-1" /> : editedUser.phoneNumber || 'Chưa cập nhật'}
          </p>
          <p className="text-sm text-gray-500 mb-2">
            <strong>Trạng thái:</strong> {editedUser.isActive ? 'Hoạt động' : 'Đã khóa'}
          </p>
          <p className="text-sm text-gray-500 mb-2">
            <strong>Thời gian tạo:</strong> {new Date(editedUser.createdAt?.seconds * 1000).toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mb-2">
            <strong>Lần đăng nhập cuối:</strong> {editedUser.lastLogin ? new Date(editedUser.lastLogin.seconds * 1000).toLocaleString() : 'Chưa đăng nhập'}
          </p>
        </div>
        <div className="mt-4">
          {isEditing ? (
            <>
              <button onClick={handleSave} className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2">
                Lưu
              </button>
              <button onClick={() => setIsEditing(false)} className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">
                Hủy
              </button>
            </>
          ) : (
            <button onClick={() => setIsEditing(true)} className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded mr-2">
              Chỉnh sửa
            </button>
          )}
          <button onClick={onClose} className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}