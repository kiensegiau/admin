import CourseForm from '../components/CourseForm';

export default function AddCourse() {
  return (
    <main className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Thêm khóa học mới</h1>
      <CourseForm />
    </main>
  );
}