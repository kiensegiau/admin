import { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { toast } from 'sonner';

export default function AddUserModal({ isOpen, onClose, onAddUser }) {
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    password: '',
    isActive: true,
  });

  const handleChange = (e) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const auth = getAuth();
      const userCredential = await createUserWithEmailAndPassword(auth, newUser.email, newUser.password);
      const user = userCredential.user;

      const { password, ...userDataWithoutPassword } = newUser;
      const docRef = await addDoc(collection(db, 'users'), {
        ...userDataWithoutPassword,
        uid: user.uid,
        createdAt: new Date(),
      });

      onAddUser({ id: docRef.id, ...userDataWithoutPassword, uid: user.uid });
      toast.success('Người dùng mới đã được thêm');
      onClose();
    } catch (error) {
      console.error('Lỗi khi thêm người dùng:', error);
      let errorMessage = 'Không thể thêm người dùng mới: ';
      switch (error.code) {
        case 'auth/email-already-in-use':
          errorMessage += 'Email này đã được sử dụng.';
          break;
        case 'auth/invalid-email':
          errorMessage += 'Địa chỉ email không hợp lệ.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage += 'Tạo tài khoản bằng email và mật khẩu không được cho phép.';
          break;
        case 'auth/weak-password':
          errorMessage += 'Mật khẩu quá yếu. Vui lòng chọn mật khẩu mạnh hơn.';
          break;
        case 'auth/network-request-failed':
          errorMessage += 'Lỗi kết nối mạng. Vui lòng kiểm tra kết nối internet của bạn.';
          break;
        default:
          errorMessage += error.message;
      }
      toast.error(errorMessage);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full" onClick={onClose}>
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">Thêm người dùng mới</h3>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="fullName">
              Tên đầy đủ
            </label>
            <input
              type="text"
              name="fullName"
              id="fullName"
              value={newUser.fullName}
              onChange={handleChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              Email
            </label>
            <input
              type="email"
              name="email"
              id="email"
              value={newUser.email}
              onChange={handleChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="phoneNumber">
              Số điện thoại
            </label>
            <input
              type="tel"
              name="phoneNumber"
              id="phoneNumber"
              value={newUser.phoneNumber}
              onChange={handleChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Mật khẩu
            </label>
            <input
              type="text"
              name="password"
              id="password"
              value={newUser.password}
              onChange={handleChange}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              required
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              Thêm người dùng
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}