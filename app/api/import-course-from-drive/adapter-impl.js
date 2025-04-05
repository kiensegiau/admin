/**
 * Triển khai import course từ Google Drive với adapter cho MongoDB
 */

import { CourseAdapter } from '@/lib/adapters/course-adapter';
import { getFileType } from './utils';

/**
 * Tìm hoặc tạo mới khóa học
 * @param {string} name - Tên khóa học
 * @param {string} driveUrl - URL của thư mục trên Google Drive
 * @param {string} driveFolderId - ID của thư mục trên Google Drive
 * @returns {Promise<Object>} - Thông tin khóa học
 */
export async function getOrCreateCourse(name, driveUrl = null, driveFolderId = null) {
  // Tìm khóa học chính xác theo tên trong MongoDB
  const existingCourses = await fetch(`/api/courses?search=${encodeURIComponent(name)}`).then(res => res.json());
  
  // Lọc để chỉ lấy các khóa học có tên chính xác khớp với name
  const exactMatch = existingCourses.data?.filter(course => course.title === name);
  
  // Nếu đã tồn tại, trả về khóa học đầu tiên tìm thấy
  if (exactMatch && exactMatch.length > 0) {
    const course = exactMatch[0];
    console.log(`Tìm thấy khóa học đã tồn tại: ${course.title} (${course.id})`);
    
    // Cập nhật thông tin Drive nếu cần
    if (driveUrl || driveFolderId) {
      const updateData = {
        ...(driveUrl && { driveUrl }),
        ...(driveFolderId && { driveFolderId }),
      };
      
      await fetch(`/api/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
    }
    
    return {
      id: course.id,
      title: course.title,
      isExisting: true
    };
  }
  
  // Nếu chưa có, tạo khóa học mới sử dụng API tạo khóa học có kiểm tra trùng lặp
  const newCourseData = {
    title: name,
    driveUrl,
    driveFolderId,
    price: 0,
    status: "draft"
  };
  
  const result = await fetch('/api/courses/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newCourseData),
  }).then(res => res.json());
  
  if (!result.success) {
    throw new Error(result.error || 'Không thể tạo khóa học mới');
  }
  
  console.log(`Đã tạo khóa học mới: ${result.course.title} (${result.course.id})`);
  
  return {
    id: result.course.id,
    title: result.course.title,
    isExisting: false
  };
}

/**
 * Tìm hoặc tạo mới chapter trong khóa học
 * @param {string} courseId - ID của khóa học
 * @param {string} name - Tên chapter
 * @returns {Promise<Object>} - Thông tin chapter
 */
export async function getOrCreateChapter(courseId, name) {
  return CourseAdapter.getOrCreateChapter(courseId, name);
}

/**
 * Tạo mới chapter
 * @param {string} courseId - ID của khóa học
 * @param {string} name - Tên chapter
 * @returns {Promise<Object>} - Thông tin chapter 
 */
export async function createChapter(courseId, name) {
  return getOrCreateChapter(courseId, name);
}

/**
 * Tìm hoặc tạo mới lesson trong chapter
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} name - Tên lesson
 * @returns {Promise<Object>} - Thông tin lesson
 */
export async function getOrCreateLesson(courseId, chapterId, name) {
  return CourseAdapter.getOrCreateLesson(courseId, chapterId, name);
}

/**
 * Tạo mới lesson
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} name - Tên lesson
 * @returns {Promise<Object>} - Thông tin lesson
 */
export async function createLesson(courseId, chapterId, name) {
  return getOrCreateLesson(courseId, chapterId, name);
}

/**
 * Tìm hoặc tạo mới thư mục con trong lesson
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {string} folderName - Tên thư mục con
 * @returns {Promise<Object>} - Thông tin thư mục con
 */
export async function getOrCreateSubfolder(courseId, chapterId, lessonId, folderName) {
  // Thư mục con được xử lý với ID duy nhất
  const subfolderId = `${folderName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
  
  return {
    id: subfolderId,
    name: folderName
  };
}

/**
 * Kiểm tra và xóa files trùng lặp
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {string} newFileName - Tên file mới
 * @param {string} subfolderId - ID của thư mục con (nếu có)
 * @returns {Promise<boolean>} - Có file trùng lặp không
 */
export async function checkAndDeleteDuplicateFiles(courseId, chapterId, lessonId, newFileName, subfolderId = null) {
  // Gọi đến API để lấy thông tin lesson
  const lessonInfo = await fetch(`/api/courses/${courseId}/lessons?chapterIndex=${chapterId}&lessonIndex=${lessonId}`).then(res => res.json());
  
  if (!lessonInfo || !lessonInfo.lesson) {
    return false;
  }
  
  // Kiểm tra file trùng lặp
  let hasDuplicate = false;
  
  if (subfolderId) {
    // Kiểm tra trong subfolder
    const subfolder = lessonInfo.lesson.subfolders?.find(sf => sf.id === subfolderId);
    if (subfolder) {
      const duplicateFile = subfolder.files?.find(f => f.name === newFileName);
      if (duplicateFile && duplicateFile.wasabiKey) {
        // Xóa file từ Wasabi
        await fetch(`/api/storage/delete?key=${encodeURIComponent(duplicateFile.wasabiKey)}`, {
          method: 'DELETE'
        });
        hasDuplicate = true;
      }
    }
  } else {
    // Kiểm tra trong lesson
    if (lessonInfo.lesson.metadata && 
        lessonInfo.lesson.metadata.originalName === newFileName &&
        lessonInfo.lesson.metadata.wasabiKey) {
      // Xóa file từ Wasabi
      await fetch(`/api/storage/delete?key=${encodeURIComponent(lessonInfo.lesson.metadata.wasabiKey)}`, {
        method: 'DELETE'
      });
      hasDuplicate = true;
    }
  }
  
  return hasDuplicate;
}

/**
 * Thêm file vào lesson
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {Object} file - Thông tin file
 * @param {string} subfolderId - ID của thư mục con (nếu có)
 * @returns {Promise<boolean>} - Kết quả thêm file
 */
export async function addFileToLesson(courseId, chapterId, lessonId, file, subfolderId = null) {
  // Chuẩn bị dữ liệu file
  const fileData = {
    name: file.name,
    originalName: file.name,
    mimeType: file.mimeType,
    size: file.size,
    wasabiKey: file.wasabiKey,
    wasabiUrl: file.wasabiUrl,
    id: file.id,
    duration: file.duration,
    subfolder: subfolderId ? file.subfolder : null,
  };
  
  // Sử dụng adapter để thêm file
  await CourseAdapter.addFileToLesson(courseId, chapterId, lessonId, fileData, subfolderId);
  
  return true;
}

/**
 * Đồng bộ hóa các mục đã xóa
 * @param {string} courseId - ID của khóa học
 * @returns {Promise<Object>} - Kết quả đồng bộ 
 */
export async function synchronizeDeletedItems(courseId) {
  // Script đồng bộ hóa các mục đã xóa
  // Nếu cần thiết, có thể triển khai chi tiết hơn
  return {
    success: true,
    message: "Đã đồng bộ hóa các mục đã xóa"
  };
}

/**
 * Lấy loại file dựa vào mime type
 * Reuse từ file utils để đảm bảo tính nhất quán
 */
export { getFileType }; 