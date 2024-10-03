"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, collection, addDoc, deleteDoc, arrayUnion, getDocs, arrayRemove } from "firebase/firestore";
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

export default function EditCourse({ params }) {
  const [course, setCourse] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const { id } = params;

  const [isAddChapterModalOpen, setIsAddChapterModalOpen] = useState(false);
  const [isAddLessonModalOpen, setIsAddLessonModalOpen] = useState(false);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [isB2UploadModalOpen, setIsB2UploadModalOpen] = useState(false);

  const sortChaptersAndLessons = (chapters) => {
    return chapters.sort((a, b) => a.title.localeCompare(b.title)).map(chapter => ({
      ...chapter,
      lessons: chapter.lessons ? chapter.lessons.sort((a, b) => a.title.localeCompare(b.title)) : []
    }));
  };

  const updateChapters = (updatedChapters) => {
    setCourse(prevCourse => ({
      ...prevCourse,
      chapters: sortChaptersAndLessons(updatedChapters)
    }));
  };

  useEffect(() => {
    const fetchCourse = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, "courses", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const courseData = { id: docSnap.id, ...docSnap.data() };
          setCourse(courseData);
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
      const courseRef = doc(db, "courses", id);
      const courseDoc = await getDoc(courseRef);
      const courseData = courseDoc.data();

      const newChapters = chaptersData.map((chapterTitle, index) => ({
        id: Date.now().toString() + index,
        title: chapterTitle,
        order: (courseData.chapters ? courseData.chapters.length : 0) + index + 1,
        lessons: []
      }));

      await updateDoc(courseRef, {
        chapters: arrayUnion(...newChapters)
      });

      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: [...(prevCourse.chapters || []), ...newChapters]
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
          const newLesson = {
            id: Date.now().toString(),
            title: lessonData.title,
            files: []
          };
          return {
            ...chapter,
            lessons: [...(chapter.lessons || []), newLesson]
          };
        }
        return chapter;
      });

      await updateDoc(courseRef, { chapters: updatedChapters });

      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: updatedChapters
      }));

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
      const courseData = courseDoc.data();

      const updatedChapters = courseData.chapters.map(chapter => {
        if (chapter.id === selectedChapterId) {
          const updatedLessons = chapter.lessons.map(l => {
            if (l.id === updatedLesson.id) {
              return { ...l, ...updatedLesson };
            }
            return l;
          });
          return { ...chapter, lessons: updatedLessons };
        }
        return chapter;
      });

      await updateDoc(courseRef, { chapters: updatedChapters });

      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: updatedChapters
      }));

      setSelectedLesson(updatedLesson);
      toast.success("Bài học đã được cập nhật");
    } catch (error) {
      console.error("Lỗi khi cập nhật bài học:", error);
      toast.error("Không thể cập nhật bài học");
    }
  };



  const addFakeDataToCourse = async (courseId) => {
    try {
      const courseRef = doc(db, "courses", courseId);
      await updateDoc(courseRef, moonCourseData);
      toast.success("Đã thêm dữ liệu giả vào khóa học");
    } catch (error) {
      console.error("Lỗi khi thêm dữ liệu giả:", error);
      toast.error("Không thể thêm dữ liệu giả");
    }
  };

  const handleOpenB2UploadModal = (lesson) => {
    setSelectedLesson(lesson);
    setIsB2UploadModalOpen(true);
  };

  const handleB2FileAdded = async (fileData) => {
    try {
      const courseRef = doc(db, "courses", id);
      const courseDoc = await getDoc(courseRef);
      const courseData = courseDoc.data();

      const updatedChapters = courseData.chapters.map(chapter => {
        if (chapter.id === selectedLesson.chapterId) {
          const updatedLessons = chapter.lessons.map(lesson => {
            if (lesson.id === selectedLesson.id) {
              return {
                ...lesson,
                files: [...(lesson.files || []), fileData]
              };
            }
            return lesson;
          });
          return { ...chapter, lessons: updatedLessons };
        }
        return chapter;
      });

      await updateDoc(courseRef, { chapters: updatedChapters });

      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: updatedChapters
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
            <h1 className="text-3xl font-semibold text-gray-800 mb-6">
              {course.title}
            </h1>
            <button
              onClick={() => setIsAddChapterModalOpen(true)}
              className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Thêm chương mới
            </button>
            <button
              onClick={() => addFakeDataToCourse(id)}
              className="mb-4 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
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
              courseName={course.title}
              chapterName={
                course.chapters.find(
                  (chapter) => chapter.id === selectedChapterId
                )?.title
              }
              onOpenB2UploadModal={handleOpenB2UploadModal}
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
        {isB2UploadModalOpen && (
          <B2UploadModal
            onClose={() => setIsB2UploadModalOpen(false)}
            onFileAdded={handleB2FileAdded}
            courseId={id}
            chapterId={selectedChapterId}
            lessonId={selectedLesson?.id}
            courseName={course.title}
            chapterName={
              course.chapters.find((c) => c.id === selectedLesson?.chapterId)
                ?.title
            }
            lessonName={selectedLesson?.title}
          />
        )}
      </div>
    </div>
  );
}