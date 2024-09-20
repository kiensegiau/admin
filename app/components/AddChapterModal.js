import { useState } from "react";

export default function AddChapterModal({ onClose, onAddChapter, chapterCount }) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddChapter({ title, order: chapterCount + 1 });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white p-6 rounded-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl font-semibold mb-4">Thêm chương mới</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tiêu đề chương"
            className="w-full border p-2 rounded mb-4"
            required
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
            >
              Thêm
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
