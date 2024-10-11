import { useState, useEffect, useCallback } from 'react';
import { db } from '.././firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import AddFileModal from './AddFileModal';
import FileViewModal from './FileViewModal';
import LoadingSpinner from './LoadingSpinner';
import { toast } from 'sonner';
import VideoModal from './VideoModal';
import VideoPlayer from './VideoPlayer';

export default function LessonContent({ lesson, courseId, chapterId, courseName, chapterName, onOpenB2UploadModal }) {
  const [isAddFileModalOpen, setIsAddFileModalOpen] = useState(false);
  const [isFileViewModalOpen, setIsFileViewModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [lessonData, setLessonData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedVideoFile, setSelectedVideoFile] = useState(null);
  const [isVideoPlayerVisible, setIsVideoPlayerVisible] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

  const fetchLessonData = useCallback(async () => {
    if (!lesson?.id) {
      setLessonData(null);
      setIsLoading(false);
      return;
    }

    try {
      const courseRef = doc(db, 'courses', courseId);
      const courseDoc = await getDoc(courseRef);
      if (courseDoc.exists()) {
        const courseData = courseDoc.data();
        const chapter = courseData.chapters.find(ch => ch.id === chapterId);
        const lessonData = chapter?.lessons.find(l => l.id === lesson.id);
        setLessonData(lessonData || { title: lesson.title || '', files: [] });
      } else {
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
    if (file.type === 'application/vnd.apple.mpegurl' || file.type.startsWith('video/')) {
      setSelectedVideoFile(file);
      setIsVideoModalOpen(true);
    } else if (file.r2FileId) {
      setSelectedFile(file);
      setIsFileViewModalOpen(true);
    } else if (file.driveUrl) {
      window.open(file.driveUrl, '_blank');
    }
  }, []);

  const handleDeleteFile = useCallback(async (fileToDelete) => {
    if (!lesson?.id) {
      toast.error('Không thể xóa file: Bài học không hợp lệ');
      return;
    }

    if (window.confirm('Bạn có chắc chắn muốn xóa file này?')) {
      try {
        const courseRef = doc(db, 'courses', courseId);
        const courseDoc = await getDoc(courseRef);
        const courseData = courseDoc.data();

        const updatedChapters = courseData.chapters.map(chapter => 
          chapter.id === chapterId
            ? {
                ...chapter,
                lessons: chapter.lessons.map(l => 
                  l.id === lesson.id
                    ? { ...l, files: l.files.filter(file => file.name !== fileToDelete.name) }
                    : l
                )
              }
            : chapter
        );

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

  const handleViewVideo = () => {
    if (lessonData?.videoUrl) {
      setIsVideoPlayerVisible(true);
    } else {
      toast.error('Không có video cho bài học này');
    }
  };

  if (isLoading) return <LoadingSpinner />;

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
      <button
        onClick={() => onOpenB2UploadModal(lesson)}
        className="bg-green-500 text-white px-2 py-1 rounded text-sm mr-2"
      >
        Upload B2
      </button>
      {lessonData?.videoUrl && (
        <div>
          <button
            onClick={handleViewVideo}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition duration-300"
          >
            Xem Video
          </button>
          {isVideoPlayerVisible && (
            <div className="mt-4">
              <VideoPlayer
                fileId={lessonData.videoUrl}
                onError={(error) => console.error("Video Player Error:", error)}
              />
              <button
                onClick={() => setIsVideoPlayerVisible(false)}
                className="mt-2 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition duration-300"
              >
                Đóng Video
              </button>
            </div>
          )}
        </div>
      )}
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
              <li
                key={file.id || index}
                className="flex items-center justify-between bg-gray-100 p-2 rounded hover:bg-gray-200 transition duration-300"
              >
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
        <p className="text-gray-500 italic">
          Chưa có tài liệu nào cho bài học này.
        </p>
      )}
      {isVideoModalOpen && selectedVideoFile && (
        <VideoModal
          fileId={selectedVideoFile.r2FileId}
          fileName={selectedVideoFile.name}
          onClose={() => {
            setSelectedVideoFile(null);
            setIsVideoModalOpen(false);
          }}
        />
      )}
    </div>
  );
}