import { useState } from "react";
import { storage } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { toast } from "sonner";

export default function AddLessonModal({ onClose, onAddLesson, chapterId }) {
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    setFiles([...e.target.files]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    const uploadedFiles = [];

    try {
      for (const file of files) {
        const fileRef = ref(storage, `courses/${chapterId}/${file.name}`);
        await uploadBytes(fileRef, file);
        const url = await getDownloadURL(fileRef);
        uploadedFiles.push({ name: file.name, url, type: file.type });
      }

      await onAddLesson({ title, files: uploadedFiles });
      toast.success("Bài học đã được thêm");
      onClose();
    } catch (error) {
      console.error("Lỗi khi upload file:", error);
      toast.error("Không thể upload file");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white p-6 rounded-lg w-1/2" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-semibold mb-4">Thêm bài học mới</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề bài học"
            className="w-full border p-2 rounded mb-4"
            required
          />
          <input
            type="file"
            onChange={handleFileChange}
            className="w-full border p-2 rounded mb-4"
            multiple
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
