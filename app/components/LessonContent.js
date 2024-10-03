import { useState, useEffect, useCallback } from 'react';
import { db } from '.././firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AddFileModal from './AddFileModal';
import FileViewModal from './FileViewModal';
import LoadingSpinner from './LoadingSpinner';
import { toast } from 'sonner';
import { ref, deleteObject } from 'firebase/storage';
import { storage } from '.././firebase';

export default function LessonContent({ lesson, courseId, chapterId, courseName, chapterName, onOpenB2UploadModal }) {
  const [isAddFileModalOpen, setIsAddFileModalOpen] = useState(false);
  const [isFileViewModalOpen, setIsFileViewModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [lessonData, setLessonData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLessonData = useCallback(async () => {
    if (!lesson || !lesson.id) {
      console.log('Không có bài học được chọn hoặc bài học không có id');
      setLessonData(null);
      setIsLoading(false);
      return;
    }

    console.log('Đang tải dữ liệu cho bài học:', lesson.id);
    try {
      const courseRef = doc(db, 'courses', courseId);
      const courseDoc = await getDoc(courseRef);
      if (courseDoc.exists()) {
        const courseData = courseDoc.data();
        const chapter = courseData.chapters.find(ch => ch.id === chapterId);
        if (chapter) {
          const lessonData = chapter.lessons.find(l => l.id === lesson.id);
          if (lessonData) {
            console.log('Dữ liệu bài học:', lessonData);
            setLessonData(lessonData);
          } else {
            console.log('Không tìm thấy dữ liệu cho bài học:', lesson.id);
            setLessonData({ title: lesson.title || '', files: [] });
          }
        } else {
          console.log('Không tìm thấy chương:', chapterId);
          setLessonData({ title: lesson.title || '', files: [] });
        }
      } else {
        console.log('Không tìm thấy khóa học:', courseId);
        setLessonData({ title: lesson.title || '', files: [] });
      }
    } catch (error) {
      console.error('Lỗi khi tải dữ liệu bài học:', error);
      setLessonData({ title: lesson.title || '', files: [] });
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


  const handleDeleteFile = useCallback(async (fileToDelete) => {
    if (!lesson || !lesson.id) {
      console.error('Không có bài học được chọn hoặc bài học không có id');
      toast.error('Không thể xóa file: Bài học không hợp lệ');
      return;
    }

    if (window.confirm('Bạn có chắc chắn muốn xóa file này?')) {
      try {
        const courseRef = doc(db, 'courses', courseId);
        const courseDoc = await getDoc(courseRef);
        const courseData = courseDoc.data();

        const updatedChapters = courseData.chapters.map(chapter => {
          if (chapter.id === chapterId) {
            const updatedLessons = chapter.lessons.map(l => {
              if (l.id === lesson.id) {
                return {
                  ...l,
                  files: l.files.filter(file => file.name !== fileToDelete.name)
                };
              }
              return l;
            });
            return { ...chapter, lessons: updatedLessons };
          }
          return chapter;
        });

        await updateDoc(courseRef, { chapters: updatedChapters });

        setLessonData(prevData => ({
          ...prevData,
          files: prevData.files.filter(file => file.name !== fileToDelete.name)
        }));
        toast.success('Đã xóa file');
      } catch (error) {
        console.error('Lỗi khi xóa file:', error);
        toast.error('Không thể xóa file');
      }
    }
  }, [lesson, courseId, chapterId]);

  const handleOpenB2UploadModal = () => {
    onOpenB2UploadModal(lesson);
  };

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
      <h2 className="text-3xl font-semibold mb-6">{lesson.title}</h2>
      <button 
        onClick={() => setIsAddFileModalOpen(true)}
        className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition duration-300"
      >
        Thêm tài liệu
      </button>
      {/* Nút Upload B2 */}
      <button
        onClick={handleOpenB2UploadModal}
        className="bg-green-500 text-white px-2 py-1 rounded text-sm mr-2"
      >
        Upload B2
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