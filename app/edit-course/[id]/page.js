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

  const handleChange = (e) => {
    setCourse({ ...course, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, "courses", id), course);
      toast.success("Khóa học đã được cập nhật");
      setIsEditing(false);
    } catch (error) {
      console.error("Lỗi khi cập nhật khóa học:", error);
      toast.error("Không thể cập nhật khóa học");
    }
  };

  const addChapter = async () => {
    try {
      const chapterRef = await addDoc(collection(db, "courses", id, "chapters"), {
        title: "Chương mới",
        order: course.chapters ? course.chapters.length + 1 : 1,
      });
      setCourse({
        ...course,
        chapters: [...(course.chapters || []), { id: chapterRef.id, title: "Chương mới" }],
      });
      toast.success("Đã thêm chương mới");
    } catch (error) {
      console.error("Lỗi khi thêm chương:", error);
      toast.error("Không thể thêm chương mới");
    }
  };

  const handleAddChapter = async (chapterData) => {
    try {
      const courseRef = doc(db, "courses", id);
      const courseDoc = await getDoc(courseRef);
      const courseData = courseDoc.data();

      const newChapter = {
        id: Date.now().toString(),
        ...chapterData,
        order: courseData.chapters ? courseData.chapters.length + 1 : 1,
        lessons: []
      };

      await updateDoc(courseRef, {
        chapters: arrayUnion(newChapter)
      });

      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: [...(prevCourse.chapters || []), newChapter]
      }));

      toast.success("Đã thêm chương mới");
      setIsAddChapterModalOpen(false);
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
            <button 
              onClick={() => setIsAddChapterModalOpen(true)}
              className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Thêm chương mới
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
              chapterName={course.chapters.find(chapter => chapter.id === selectedChapterId)?.title}
            />
          </div>
        </main>
        {isAddChapterModalOpen && (
          <AddChapterModal
            onClose={() => setIsAddChapterModalOpen(false)}
            onAddChapter={handleAddChapter}
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
      </div>
    </div>
  );
}
