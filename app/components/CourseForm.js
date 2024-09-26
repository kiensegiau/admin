'use client';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const schema = yup.object().shape({
  title: yup.string().required('Tiêu đề là bắt buộc'),
  description: yup.string().required('Mô tả là bắt buộc'),
  price: yup.number().positive('Giá phải là số dương').required('Giá là bắt buộc'),
});

export default function CourseForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: yupResolver(schema),
  });
  const router = useRouter();

  const onSubmit = async (data) => {
    try {
      const courseData = {
        ...data,
        chapters: [],
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'courses'), courseData);
      toast.success('Khóa học đã được thêm thành công');
      router.push('/');
    } catch (error) {
      toast.error('Có lỗi xảy ra khi thêm khóa học');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="title" className="block mb-1">Tiêu đề</label>
        <input
          id="title"
          {...register('title')}
          className="w-full border p-2 rounded"
        />
        {errors.title && <p className="text-red-500">{errors.title.message}</p>}
      </div>
      <div>
        <label htmlFor="description" className="block mb-1">Mô tả</label>
        <textarea
          id="description"
          {...register('description')}
          className="w-full border p-2 rounded"
        />
        {errors.description && <p className="text-red-500">{errors.description.message}</p>}
      </div>
      <div>
        <label htmlFor="price" className="block mb-1">Giá</label>
        <input
          id="price"
          type="number"
          {...register('price')}
          className="w-full border p-2 rounded"
        />
        {errors.price && <p className="text-red-500">{errors.price.message}</p>}
      </div>
      <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
        Thêm khóa học
      </button>
    </form>
  );
}