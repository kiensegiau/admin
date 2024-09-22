import { useState, useEffect } from "react";
import { updateDoc, doc, deleteDoc, getDocs, collection } from "firebase/firestore";
import { db } from "../firebase";
import { toast } from "sonner";
import { Spin } from 'antd';

export default function ChapterList({ courseId, chapters, onSelectLesson, onAddLesson, onUpdateChapters, onSelectChapter, expandedChapter, setExpandedChapter }) {

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (expandedChapter) {
      const chapterStillExists = chapters.some(chapter => chapter.id === expandedChapter);
      if (!chapterStillExists) {
        onSelectChapter(null);
      }
    }
  }, [chapters, expandedChapter, onSelectChapter]);

  const toggleChapter = (chapterId) => {
    onSelectChapter(chapterId);
  };

  const deleteChapter = async (chapterId) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa chương này?")) {
      setLoading(true);
      try {
        // Xóa tất cả các bài học trong chương
        const lessonsSnapshot = await getDocs(collection(db, "courses", courseId, "chapters", chapterId, "lessons"));
        const deleteLessonPromises = lessonsSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deleteLessonPromises);

        // Xóa chương
        await deleteDoc(doc(db, "courses", courseId, "chapters", chapterId));

        // Cập nhật state local
        const updatedChapters = chapters.filter(chapter => chapter.id !== chapterId);
        onUpdateChapters(updatedChapters);

        toast.success("Chương đã được xóa");
      } catch (error) {
        console.error("Lỗi khi xóa chương:", error);
        toast.error("Không thể xóa chương");
      } finally {
        setLoading(false);
      }
    }
  };

  const deleteLesson = async (chapterId, lessonId) => {
    if (window.confirm("Bạn có chắc chắn muốn xóa bài học này?")) {
      setLoading(true);
      try {
        await deleteDoc(doc(db, "courses", courseId, "chapters", chapterId, "lessons", lessonId));
        const updatedChapters = chapters.map(chapter => {
          if (chapter.id === chapterId) {
            return {
              ...chapter,
              lessons: chapter.lessons.filter(lesson => lesson.id !== lessonId)
            };
          }
          return chapter;
        });
        onUpdateChapters(updatedChapters);
        toast.success("Bài học đã được xóa");
      } catch (error) {
        console.error("Lỗi khi xóa bài học:", error);
        toast.error("Không thể xóa bài học");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Spin spinning={loading}>
      <div className="space-y-4">
        {chapters.map((chapter, index) => (
          <div key={chapter.id} className="border rounded-lg overflow-hidden">
            <div
              className="flex justify-between items-center cursor-pointer bg-gray-100 p-4"
              onClick={() => toggleChapter(chapter.id)}
            >
              <h3 className="text-lg font-semibold">Chương: {chapter.title}</h3>
              <div className="flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChapter(chapter.id);
                  }}
                  className="text-red-500 mr-2 hover:text-red-700"
                >
                  Xóa
                </button>
                <span className={`transition-transform ${expandedChapter === chapter.id ? 'rotate-180' : ''}`}>▼</span>
              </div>
            </div>
            {expandedChapter === chapter.id && (
              <div className="p-4">
                {Array.isArray(chapter.lessons) && chapter.lessons.length > 0 ? (
                  <ul className="space-y-2">
                    {chapter.lessons.map((lesson, lessonIndex) => (
                      <li
                        key={lesson.id}
                        className="flex items-center justify-between cursor-pointer p-2 hover:bg-gray-100 rounded"
                        onClick={() => onSelectLesson(lesson)}
                      >
                        <div className="flex-grow">
                          <span className="mr-2">{lessonIndex + 1}.</span>
                          {lesson.title}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteLesson(chapter.id, lesson.id);
                          }}
                          className="text-red-500 hover:text-red-700"
                        >
                          Xóa
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 italic">Chưa có bài học nào trong chương này.</p>
                )}
                <button
                  onClick={() => onAddLesson(chapter.id)}
                  className="mt-4 text-blue-500 hover:text-blue-700"
                >
                  + Thêm bài học
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Spin>
  );
}
