"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import { Spin } from "antd";

const ReactQuill = dynamic(() => import("react-quill"), {
  ssr: false,
  loading: () => <p>Loading editor...</p>,
});

export default function EditCourseInfoModal({ course, onClose, onUpdateCourse }) {
  const [formData, setFormData] = useState({
    title: course?.title || "",
    teacher: course?.teacher || "",
    price: course?.price || 0,
    description: course?.description || "",
    coverImage: course?.coverImage || "",
  });
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    import("react-quill/dist/quill.snow.css");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await onUpdateCourse(formData);
      onClose();
    } catch (error) {
      console.error("Lỗi khi cập nhật thông tin khóa học:", error);
      toast.error("Không thể cập nhật thông tin khóa học");
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file hình ảnh");
      return;
    }

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");
      
      const data = await response.json();
      setFormData(prev => ({
        ...prev,
        coverImage: data.url
      }));
      toast.success("Đã tải lên ảnh thành công");
    } catch (error) {
      console.error("Lỗi khi tải lên ảnh:", error);
      toast.error("Không thể tải lên ảnh");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <form onSubmit={handleSubmit} className="p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Chỉnh sửa thông tin khóa học
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tên khóa học
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Giáo viên
              </label>
              <input
                type="text"
                value={formData.teacher}
                onChange={(e) => setFormData(prev => ({ ...prev, teacher: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Giá (VNĐ)
              </label>
              <input
                type="number"
                value={formData.price}
                onChange={(e) => setFormData(prev => ({ ...prev, price: Number(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                min="0"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ảnh nền
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="w-full"
                  disabled={isUploading}
                />
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80">
                    <Spin tip="Đang tải lên..." />
                  </div>
                )}
              </div>
              {formData.coverImage && (
                <img 
                  src={formData.coverImage} 
                  alt="Cover preview" 
                  className="mt-2 max-h-40 object-cover rounded"
                />
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Mô tả khóa học
              </label>
              <ReactQuill
                value={formData.description}
                onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                className="h-40 mb-10"
              />
            </div>

            <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3">
              <button
                type="submit"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
                disabled={isUploading}
              >
                Cập nhật
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 sm:mt-0 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm"
                disabled={isUploading}
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
} 