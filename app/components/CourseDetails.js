import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { toast } from "sonner";

export default function CourseDetails({ course, onClose }) {
  const [editedCourse, setEditedCourse] = useState(course);
  const [isEditing, setIsEditing] = useState(false);

  const handleChange = (e) => {
    setEditedCourse({ ...editedCourse, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    try {
      await updateDoc(doc(db, "courses", editedCourse.id), editedCourse);
      toast.success("Thông tin khóa học đã được cập nhật");
      setIsEditing(false);
    } catch (error) {
      console.error("Lỗi khi cập nhật khóa học:", error);
      toast.error("Không thể cập nhật thông tin khóa học");
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
          Chi tiết khóa học
        </h3>
        <div className="mt-2">
          <p className="text-sm text-gray-500 mb-2">
            <strong>Tiêu đề:</strong>
            {isEditing ? (
              <input
                name="title"
                value={editedCourse.title}
                onChange={handleChange}
                className="border rounded px-2 py-1 ml-2"
              />
            ) : (
              editedCourse.title
            )}
          </p>
          <p className="text-sm text-gray-500 mb-2">
            <strong>Mô tả:</strong>
            {isEditing ? (
              <textarea
                name="description"
                value={editedCourse.description}
                onChange={handleChange}
                className="border rounded px-2 py-1 ml-2 w-full"
              />
            ) : (
              editedCourse.description
            )}
          </p>
          <p className="text-sm text-gray-500 mb-2">
            <strong>Giá:</strong>
            {isEditing ? (
              <input
                name="price"
                type="number"
                value={editedCourse.price}
                onChange={handleChange}
                className="border rounded px-2 py-1 ml-2"
              />
            ) : (
              `${editedCourse.price} VND`
            )}
          </p>
        </div>
        <div className="mt-4">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mr-2"
              >
                Lưu
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                Hủy
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="bg-yellow-500 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded mr-2"
            >
              Chỉnh sửa
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
