"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "../../firebase";
import { toast } from "sonner";
import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import ChapterList from "../../components/ChapterList";
import AddChapterModal from "../../components/AddChapterModal";
import AddLessonModal from "../../components/AddLessonModal";
import LessonContent from "../../components/LessonContent";
import { Spin } from 'antd';
import { moonCourseData } from '../../courses/fakedata';
import B2UploadModal from '../../components/B2UploadModal';
import GoogleDriveFolderSelector from '../../components/GoogleDriveFolderSelector';

export default function EditCourse({ params }) {
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { id } = params;

  const [isAddChapterModalOpen, setIsAddChapterModalOpen] = useState(false);
  const [isAddLessonModalOpen, setIsAddLessonModalOpen] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isB2UploadModalOpen, setIsB2UploadModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const sortChaptersAndLessons = useCallback((chapters) => {
    return chapters.sort((a, b) => a.title.localeCompare(b.title)).map(chapter => ({
      ...chapter,
      lessons: chapter.lessons ? chapter.lessons.sort((a, b) => a.title.localeCompare(b.title)) : []
    }));
  }, []);

  const updateChapters = useCallback((updatedChapters) => {
    setCourse(prevCourse => ({
      ...prevCourse,
      chapters: sortChaptersAndLessons(updatedChapters)
    }));
  }, [sortChaptersAndLessons]);

  useEffect(() => {
    const fetchCourse = async () => {
      setLoading(true);
      try {
        const docSnap = await getDoc(doc(db, "courses", id));
        if (docSnap.exists()) {
          setCourse({ id: docSnap.id, ...docSnap.data() });
        } else {
          toast.error("Không tìm thấy khóa học");
          router.push("/courses");
        }
      } catch (error) {
        console.error("Lỗi khi lấy thông tin khóa học:", error);
        toast.error("Không thể tải thông tin khóa học");
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [id, router]);

  const handleAddChapters = async (chaptersData) => {
    try {
      const chaptersArray = Array.isArray(chaptersData) ? chaptersData : [chaptersData];
      const courseRef = doc(db, "courses", id);
      const courseDoc = await getDoc(courseRef);
      const courseData = courseDoc.data();

      const newChapters = chaptersArray.map((chapter, index) => ({
        id: Date.now().toString() + index,
        title: chapter.title || `Chương ${index + 1}`,
        order: chapter.order || (courseData.chapters ? courseData.chapters.length : 0) + index + 1,
        lessons: []
      }));

      await updateDoc(courseRef, {
        chapters: arrayUnion(...newChapters)
      });

      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: sortChaptersAndLessons([...(prevCourse.chapters || []), ...newChapters])
      }));

      toast.success("Đã thêm các chương mới");
    } catch (error) {
      console.error("Lỗi khi thêm chương:", error);
      toast.error("Không thể thêm chương mới");
    }
  };

  const handleAddLesson = async (lessonData) => {
    try {
      const courseRef = doc(db, "courses", id);
      const courseDoc = await getDoc(courseRef);
      const courseData = courseDoc.data();

      const updatedChapters = courseData.chapters.map(chapter => {
        if (chapter.id === selectedChapterId) {
          return {
            ...chapter,
            lessons: [...(chapter.lessons || []), { id: Date.now().toString(), title: lessonData.title, files: [] }]
          };
        }
        return chapter;
      });

      await updateDoc(courseRef, { chapters: updatedChapters });
      setCourse(prevCourse => ({ ...prevCourse, chapters: updatedChapters }));

      toast.success("Đã thêm bài học mới");
      setIsAddLessonModalOpen(false);
    } catch (error) {
      console.error("Lỗi khi thêm bài học:", error);
      toast.error("Không thể thêm bài học mới");
    }
  };

  const handleUpdateLesson = async (updatedLesson) => {
    try {
      const courseRef = doc(db, "courses", id);
      const courseDoc = await getDoc(courseRef);
      const updatedChapters = courseDoc.data().chapters.map(chapter => 
        chapter.id === selectedChapterId
          ? { ...chapter, lessons: chapter.lessons.map(l => l.id === updatedLesson.id ? { ...l, ...updatedLesson } : l) }
          : chapter
      );

      await updateDoc(courseRef, { chapters: updatedChapters });
      setCourse(prevCourse => ({ ...prevCourse, chapters: updatedChapters }));
      setSelectedLesson(updatedLesson);
      toast.success("Bài học đã được cập nhật");
    } catch (error) {
      console.error("Lỗi khi cập nhật bài học:", error);
      toast.error("Không thể cập nhật bài học");
    }
  };

  const addFakeDataToCourse = async () => {
    try {
      await updateDoc(doc(db, "courses", id), moonCourseData);
      toast.success("Đã thêm dữ liệu giả vào khóa học");
    } catch (error) {
      console.error("Lỗi khi thêm dữ liệu giả:", error);
      toast.error("Không thể thêm dữ liệu giả");
    }
  };

  const handleB2FileAdded = async (fileData) => {
    try {
      const courseRef = doc(db, "courses", id);
      const courseDoc = await getDoc(courseRef);
      const updatedChapters = courseDoc.data().chapters.map(chapter => 
        chapter.id === selectedLesson.chapterId
          ? { ...chapter, lessons: chapter.lessons.map(lesson => 
              lesson.id === selectedLesson.id
                ? { ...lesson, files: [...(lesson.files || []), fileData] }
                : lesson
            )}
          : chapter
      );

      await updateDoc(courseRef, { chapters: updatedChapters });
      
      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: updatedChapters
      }));
      
      setSelectedLesson(prevLesson => ({
        ...prevLesson,
        files: [...(prevLesson.files || []), fileData]
      }));

      toast.success("Đã thêm file mới");
    } catch (error) {
      console.error("Lỗi khi thêm file:", error);
      toast.error("Không thể thêm file mới");
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spin size="large" tip="Đang tải..." />
      </div>
    );
  }

  if (!course) return null;

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 flex overflow-hidden bg-gray-200">
          <div className="w-1/3 overflow-y-auto p-6 bg-white border-r">
            <h1 className="text-3xl font-semibold text-gray-800 mb-6">{course.title}</h1>
            <button onClick={() => setIsAddChapterModalOpen(true)} className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
              Thêm chương mới
            </button>
            <button onClick={addFakeDataToCourse} className="mb-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
              Thêm dữ liệu giả
            </button>
            <ChapterList
              courseId={id}
              chapters={course.chapters || []}
              onSelectLesson={setSelectedLesson}
              onAddLesson={(chapterId) => {
                setSelectedChapterId(chapterId);
                setIsAddLessonModalOpen(true);
              }}
              onUpdateChapters={updateChapters}
              onSelectChapter={setSelectedChapterId}
              expandedChapter={selectedChapterId}
              setExpandedChapter={setSelectedChapterId}
            />
          </div>
          <div className="w-2/3 overflow-y-auto p-6">
            <LessonContent
              lesson={selectedLesson}
              onUpdateLesson={handleUpdateLesson}
              courseId={id}
              chapterId={selectedChapterId}
              courseName={course?.title}
              chapterName={course?.chapters?.find(chapter => chapter.id === selectedLesson?.chapterId)?.title}
              onOpenB2UploadModal={(lesson) => {
                setSelectedLesson(lesson);
                setIsB2UploadModalOpen(true);
              }}
            />
          </div>
        </main>
        {isAddChapterModalOpen && (
          <AddChapterModal
            onClose={() => setIsAddChapterModalOpen(false)}
            onAddChapter={handleAddChapters}
          />
        )}
        {isAddLessonModalOpen && (
          <AddLessonModal
            onClose={() => setIsAddLessonModalOpen(false)}
            onAddLesson={handleAddLesson}
            courseId={id}
            chapterId={selectedChapterId}
          />
        )}
        {isB2UploadModalOpen && selectedLesson && (
          <B2UploadModal
            onClose={() => setIsB2UploadModalOpen(false)}
            onFileAdded={handleB2FileAdded}
            courseId={id}
            chapterId={selectedChapterId}
            lessonId={selectedLesson.id}
            courseName={course?.title}
            chapterName={course?.chapters?.find(chapter => chapter.id === selectedChapterId)?.title}
            lessonName={selectedLesson.title}
          />
        )}
        {isImportModalOpen && (
          <div className="modal">
            <h2>Chọn thư mục khóa học từ Google Drive</h2>
            <GoogleDriveFolderSelector onSelect={handleFolderSelect} courseId={id} />
            <button onClick={() => setIsImportModalOpen(false)}>Đóng</button>
          </div>
        )}
      </div>
    </div>
  );
}