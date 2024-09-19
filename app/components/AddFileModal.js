import { useState } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import { toast } from "sonner";

export default function AddFileModal({ onClose, onAddFile, lessonId }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Vui lòng chọn một file");
      return;
    }

    setUploading(true);
    try {
      const fileRef = ref(storage, `lessons/${lessonId}/${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      onAddFile({ name: file.name, url, type: file.type });
      toast.success("File đã được tải lên");
      onClose();
    } catch (error) {
      console.error("Lỗi khi upload file:", error);
      toast.error("Không thể upload file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg w-1/2">
        <h2 className="text-2xl font-semibold mb-4">Thêm tài liệu mới</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="file"
            onChange={handleFileChange}
            className="w-full border p-2 rounded mb-4"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-300 text-black px-4 py-2 rounded mr-2"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="bg-blue-500 text-white px-4 py-2 rounded"
              disabled={uploading}
            >
              {uploading ? "Đang tải lên..." : "Thêm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
