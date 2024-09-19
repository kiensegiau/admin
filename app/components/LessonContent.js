import { useState } from 'react';
import AddFileModal from './AddFileModal'

export default function LessonContent({ lesson, onUpdateLesson }) {
  const [isAddFileModalOpen, setIsAddFileModalOpen] = useState(false);

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
        className="mb-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Thêm tài liệu
      </button>
      {lesson.files && lesson.files.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold mb-4">Tài liệu bài học</h3>
          <ul className="space-y-2">
            {lesson.files.map((file, index) => (
              <li key={index}>
                <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  {file.name}
                </a>
                {file.type.startsWith('video/') && (
                  <video src={file.url} controls className="mt-2 w-full max-w-lg" />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {lesson.content && (
        <div className="mt-8">
          <h3 className="text-xl font-semibold mb-4">Nội dung bài học</h3>
          <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: lesson.content }} />
        </div>
      )}
      {!lesson.files && !lesson.content && (
        <p className="text-gray-500 italic">Chưa có nội dung cho bài học này.</p>
      )}
      {isAddFileModalOpen && (
        <AddFileModal
          onClose={() => setIsAddFileModalOpen(false)}
          onAddFile={(newFile) => {
            onUpdateLesson({
              ...lesson,
              files: [...(lesson.files || []), newFile]
            });
            setIsAddFileModalOpen(false);
          }}
          lessonId={lesson.id}
        />
      )}
    </div>
  );
}
