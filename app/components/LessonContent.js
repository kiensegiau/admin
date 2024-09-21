import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '.././firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AddFileModal from './AddFileModal';
import FileViewModal from './FileViewModal';
import LoadingSpinner from './LoadingSpinner';
import { toast } from 'sonner';
import { ref, deleteObject, getMetadata } from 'firebase/storage';
import { storage } from '.././firebase';

export default function LessonContent({ lesson, onUpdateLesson, courseId, chapterId, courseName, chapterName }) {
  const [isAddFileModalOpen, setIsAddFileModalOpen] = useState(false);
  const [isFileViewModalOpen, setIsFileViewModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [lessonData, setLessonData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(lessonData?.title || lesson?.title || '');

  const fetchLessonData = useCallback(async () => {
    if (!lesson || !lesson.id) {
      console.log('Không có bài học được chọn hoặc bài học không có id');
      setLessonData(null);
      setEditedTitle('');
      setIsLoading(false);
      return;
    }

    console.log('Đang tải dữ liệu cho bài học:', lesson.id);
    try {
      const lessonRef = doc(db, 'courses', courseId, 'chapters', chapterId, 'lessons', lesson.id);
      const lessonSnap = await getDoc(lessonRef);
      if (lessonSnap.exists()) {
        console.log('Dữ liệu bài học:', lessonSnap.data());
        setLessonData(lessonSnap.data());
        setEditedTitle(lessonSnap.data().title || '');
      } else {
        console.log('Không tìm thấy dữ liệu cho bài học:', lesson.id);
        setLessonData({ title: lesson.title || '', files: [] });
        setEditedTitle(lesson.title || '');
      }
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu bài học:', error);
      setLessonData({ title: lesson.title || '', files: [] });
      setEditedTitle(lesson.title || '');
    } finally {
      setIsLoading(false);
    }
  }, [lesson, courseId, chapterId]);

  useEffect(() => {
    setIsLoading(true);
    setLessonData(null);
    fetchLessonData();
  }, [lesson, fetchLessonData]);

  const handleFileClick = useCallback((file) => {
    setSelectedFile(file);
    setIsFileViewModalOpen(true);
  }, []);

  const handleEditTitle = useCallback(async () => {
    if (editedTitle.trim() === '') return;
    if (!courseId || !chapterId || !lesson.id) {
      console.error('Thiếu thông tin cần thiết để cập nhật bài học');
      toast.error('Không thể cập nhật tên bài học');
      return;
    }
    try {
      await updateDoc(doc(db, 'courses', courseId, 'chapters', chapterId, 'lessons', lesson.id), { title: editedTitle });
      onUpdateLesson({ ...lesson, title: editedTitle });
      setIsEditingTitle(false);
      toast.success('Đã cập nhật tên bài học');
    } catch (error) {
      console.error('Lỗi khi cập nhật tên bài học:', error);
      toast.error('Không thể cập nhật tên bài học');
    }
  }, [editedTitle, courseId, chapterId, lesson, onUpdateLesson]);

  const handleDeleteFile = useCallback(async (fileToDelete) => {
    if (!lesson || !lesson.id) {
      console.error('Không có bài học được chọn hoặc bài học không có id');
      toast.error('Không thể xóa file: Bài học không hợp lệ');
      return;
    }

    if (window.confirm('Bạn có chắc chắn muốn xóa file này?')) {
      try {
        const storageRef = ref(storage, `courses/${courseName}/${chapterName}/${lesson.title}/${fileToDelete.name}`);
        await deleteObject(storageRef);

        const updatedFiles = lessonData.files.filter(file => file.name !== fileToDelete.name);
        await updateDoc(doc(db, 'courses', courseId, 'chapters', chapterId, 'lessons', lesson.id), { files: updatedFiles });

        setLessonData(prevData => ({ ...prevData, files: updatedFiles }));
        toast.success('Đã xóa file');
      } catch (error) {
        console.error('Lỗi khi xóa file:', error);
        toast.error('Không thể xóa file');
      }
    }
  }, [lesson, lessonData, courseId, chapterId, courseName, chapterName]);

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!lesson) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Chọn một bài học để xem nội dung
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      {isEditingTitle ? (
        <div className="flex items-center mb-6">
          <input
            type="text"
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            className="text-3xl font-semibold mr-2 p-1 border rounded"
          />
          <button
            onClick={handleEditTitle}
            className="bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 transition duration-300"
          >
            Lưu
          </button>
          <button
            onClick={() => setIsEditingTitle(false)}
            className="bg-gray-500 text-white px-2 py-1 rounded hover:bg-gray-600 transition duration-300 ml-2"
          >
            Hủy
          </button>
        </div>
      ) : (
        <div className="flex items-center mb-6">
          <h2 className="text-3xl font-semibold mr-2">{lesson.title}</h2>
          <button
            onClick={() => setIsEditingTitle(true)}
            className="bg-yellow-500 text-white px-2 py-1 rounded hover:bg-yellow-600 transition duration-300"
          >
            Sửa tên
          </button>
        </div>
      )}
      <button 
        onClick={() => setIsAddFileModalOpen(true)}
        className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300"
      >
        Thêm tài liệu
      </button>
      {isAddFileModalOpen && (
        <AddFileModal
          onClose={() => setIsAddFileModalOpen(false)}
          courseId={courseId}
          chapterId={chapterId}
          lessonId={lesson.id}
          courseName={courseName}
          chapterName={chapterName}
          lessonName={lesson.title}
          onFileAdded={fetchLessonData}
        />
      )}
      {lessonData?.files && lessonData.files.length > 0 ? (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4">Tài liệu bài học</h3>
          <ul className="space-y-2">
            {lessonData.files.map((file, index) => (
              <li key={index} className="flex items-center justify-between bg-gray-100 p-2 rounded hover:bg-gray-200 transition duration-300">
                <span className="flex-1">{file.name}</span>
                <span className="text-sm text-gray-500 mr-4">
                  {new Date(file.uploadTime).toLocaleString()}
                </span>
                <button
                  onClick={() => handleFileClick(file)}
                  className="bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition duration-300 mr-2"
                >
                  Xem
                </button>
                <button
                  onClick={() => handleDeleteFile(file)}
                  className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600 transition duration-300"
                >
                  Xóa
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-gray-500 italic">Chưa có tài liệu nào cho bài học này.</p>
      )}
      {isFileViewModalOpen && (
        <FileViewModal
          file={selectedFile}
          onClose={() => setIsFileViewModalOpen(false)}
        />
      )}
    </div>
  );
}
