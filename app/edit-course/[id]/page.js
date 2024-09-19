"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, collection, addDoc, deleteDoc, arrayUnion, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { toast } from "sonner";
import Sidebar from "../../components/Sidebar";
import Header from "../../components/Header";
import ChapterList from "../../components/ChapterList";
import AddChapterModal from "../../components/AddChapterModal";
import AddLessonModal from "../../components/AddLessonModal";
import LessonContent from "../../components/LessonContent";

export default function EditCourse({ params }) {
  const [course, setCourse] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
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
      chapters: updatedChapters
    }));
  };

  useEffect(() => {
    const fetchCourse = async () => {
      try {
        const docRef = doc(db, "courses", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const courseData = { id: docSnap.id, ...docSnap.data() };
          
          // Lấy thông tin về các chương
          const chaptersSnapshot = await getDocs(collection(db, "courses", id, "chapters"));
          const chaptersData = await Promise.all(chaptersSnapshot.docs.map(async (chapterDoc) => {
            const chapterData = { id: chapterDoc.id, ...chapterDoc.data() };
            
            // Lấy thông tin về các bài học trong chương
            const lessonsSnapshot = await getDocs(collection(db, "courses", id, "chapters", chapterDoc.id, "lessons"));
            chapterData.lessons = lessonsSnapshot.docs.map(lessonDoc => ({ id: lessonDoc.id, ...lessonDoc.data() }));
            
            return chapterData;
          }));
          
          courseData.chapters = sortChaptersAndLessons(chaptersData);
          setCourse(courseData);
        } else {
          toast.error("Không tìm thấy khóa học");
          router.push("/courses");
        }
      } catch (error) {
        console.error("Lỗi khi lấy thông tin khóa học:", error);
        toast.error("Không thể tải thông tin khóa học");
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
      const chapterRef = await addDoc(collection(db, "courses", id, "chapters"), {
        ...chapterData,
        order: course.chapters ? course.chapters.length + 1 : 1,
      });
      const newChapter = { id: chapterRef.id, ...chapterData };
      
      // Cập nhật danh sách chương trong tài liệu khóa học
      await updateDoc(doc(db, "courses", id), {
        chapters: arrayUnion(newChapter)
      });

      // Cập nhật state local
      setCourse({
        ...course,
        chapters: [...(course.chapters || []), newChapter],
      });
      
      toast.success("Đã thêm chương mới");
      setIsAddChapterModalOpen(false);
    } catch (error) {
      console.error("Lỗi khi thêm chương:", error);
      toast.error("Không thể thêm chương mới");
    }
  };

  const handleAddLesson = async (lessonData) => {
    try {
      const lessonRef = await addDoc(collection(db, "courses", id, "chapters", selectedChapterId, "lessons"), {
        title: lessonData.title,
        files: lessonData.files
      });
      const newLesson = { id: lessonRef.id, ...lessonData };
      
      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: prevCourse.chapters.map(chapter => 
          chapter.id === selectedChapterId
            ? { 
                ...chapter, 
                lessons: [...(chapter.lessons || []), newLesson] 
              }
            : chapter
        )
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
      await updateDoc(doc(db, "courses", id, "chapters", selectedChapterId, "lessons", updatedLesson.id), updatedLesson);
      setCourse(prevCourse => ({
        ...prevCourse,
        chapters: prevCourse.chapters.map(chapter => 
          chapter.id === selectedChapterId
            ? { 
                ...chapter, 
                lessons: chapter.lessons.map(lesson => 
                  lesson.id === updatedLesson.id ? updatedLesson : lesson
                )
              }
            : chapter
        )
      }));
      toast.success("Bài học đã được cập nhật");
    } catch (error) {
      console.error("Lỗi khi cập nhật bài học:", error);
      toast.error("Không thể cập nhật bài học");
    }
  };

  if (!course) return <div>Đang tải...</div>;

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 flex overflow-hidden bg-gray-200">
          <div className="w-1/3 overflow-y-auto p-6 bg-white border-r">
            <h1 className="text-3xl font-semibold text-gray-800 mb-6">Nội dung khóa học</h1>
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
            />
          </div>
          <div className="w-2/3 overflow-y-auto p-6">
            <LessonContent lesson={selectedLesson} onUpdateLesson={handleUpdateLesson} />
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
            chapterId={selectedChapterId}
          />
        )}
      </div>
    </div>
  );
}
