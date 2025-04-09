/**
 * Triển khai import course từ Google Drive với adapter cho MongoDB
 */

import { CourseAdapter } from '@/lib/adapters/course-adapter';
import { findOneDocument, findDocuments, insertDocument, updateDocument, connectToDatabase, ObjectId } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getFileType } from './utils';

// Cache cải tiến với các tính năng: thời gian hết hạn, thống kê hiệu suất, và xử lý race condition
const courseContentsCache = {
  // Dữ liệu cache
  data: new Map(),
  
  // Thống kê hiệu suất cache
  stats: {
    hits: 0,
    misses: 0,
    updates: 0,
    evictions: 0,
    size: () => courseContentsCache.data.size
  },
  
  // Cấu hình cache
  config: {
    maxAge: 5 * 60 * 1000, // Thời gian hết hạn: 5 phút
    maxSize: 100, // Số lượng khóa học tối đa trong cache
  },
  
  // Lấy dữ liệu từ cache
  get(courseId) {
    // Chuyển đổi ObjectId thành string nếu cần
    const id = courseId instanceof ObjectId ? courseId.toString() : courseId;
    
    const cached = this.data.get(id);
    if (cached) {
      // Kiểm tra xem cache có hết hạn không
      if (Date.now() - cached.timestamp < this.config.maxAge) {
        this.stats.hits++;
        console.log(`[Cache] HIT - KH ${id} - Hits: ${this.stats.hits}, Misses: ${this.stats.misses}`);
        return cached.data;
      } else {
        // Cache đã hết hạn
        this.data.delete(id);
        this.stats.evictions++;
        console.log(`[Cache] HẾT HẠN - KH ${id} - ${new Date(cached.timestamp).toLocaleString()}`);
      }
    }
    
    this.stats.misses++;
    console.log(`[Cache] MISS - KH ${id} - Hits: ${this.stats.hits}, Misses: ${this.stats.misses}`);
    return null;
  },
  
  // Lưu dữ liệu vào cache
  set(courseId, data) {
    // Chuyển đổi ObjectId thành string nếu cần
    const id = courseId instanceof ObjectId ? courseId.toString() : courseId;
    
    // Xóa cache cũ nếu vượt quá giới hạn
    if (this.data.size >= this.config.maxSize && !this.data.has(id)) {
      // Xóa cache cũ nhất
      let oldestId = null;
      let oldestTime = Date.now();
      
      for (const [key, value] of this.data.entries()) {
        if (value.timestamp < oldestTime) {
          oldestTime = value.timestamp;
          oldestId = key;
        }
      }
      
      if (oldestId) {
        this.data.delete(oldestId);
        this.stats.evictions++;
        console.log(`[Cache] XÓA CŨ - KH ${oldestId} để giải phóng bộ nhớ`);
      }
    }
    
    // Clone dữ liệu cẩn thận để tránh tham chiếu chung
    // structuredClone là API mới của Node.js để clone sâu đối tượng
    // Nếu không hỗ trợ, sẽ dùng phương pháp cũ an toàn hơn
    let clonedData;
    try {
      clonedData = typeof structuredClone === 'function' 
        ? structuredClone(data)
        : JSON.parse(JSON.stringify(data));
    } catch (error) {
      // Nếu lỗi, vẫn lưu tham chiếu gốc
      console.warn(`[Cache] Lỗi clone data: ${error.message}. Sử dụng tham chiếu gốc`);
      clonedData = data;
    }
    
    // Lưu vào cache với timestamp
    this.data.set(id, {
      data: clonedData,
      timestamp: Date.now()
    });
    
    this.stats.updates++;
    console.log(`[Cache] CẬP NHẬT - KH ${id} - Tổng: ${this.stats.size()}`);
    
    return clonedData;
  },
  
  // Xóa dữ liệu khỏi cache
  delete(courseId) {
    // Chuyển đổi ObjectId thành string nếu cần
    const id = courseId instanceof ObjectId ? courseId.toString() : courseId;
    
    if (id) {
      const existed = this.data.has(id);
      this.data.delete(id);
      if (existed) {
        console.log(`[Cache] XÓA - KH ${id}`);
        return true;
      }
      return false;
    } else {
      const size = this.data.size;
      this.data.clear();
      console.log(`[Cache] XÓA TẤT CẢ - ${size} mục`);
      return true;
    }
  },
  
  // Lấy thống kê cache
  getStats() {
    return {
      ...this.stats,
      size: this.stats.size(),
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) * 100 || 0
    };
  }
};

/**
 * Lấy nội dung khóa học từ cache hoặc từ database
 * @param {string} courseId - ID khóa học
 * @returns {Promise<Object>} - Thông tin nội dung khóa học
 */
async function getCourseContents(courseId) {
  // Kiểm tra xem có trong cache không
  const cachedData = courseContentsCache.get(courseId);
  if (cachedData) {
    return cachedData;
  }
  
  // Nếu không có trong cache, lấy từ database
  const startTime = Date.now();
  
  try {
    const courseContent = await findOneDocument("courseContents", { 
      courseId: new ObjectId(courseId)
    });
    
    const duration = Date.now() - startTime;
    console.log(`[Cache] Lấy DB - KH ${courseId} - ${duration}ms`);
    
    // Lưu vào cache nếu có dữ liệu
    if (courseContent) {
      return courseContentsCache.set(courseId, courseContent);
    }
    
    return null;
  } catch (error) {
    console.error(`[Cache] Lỗi truy vấn DB - KH ${courseId}: ${error.message}`);
    return null;
  }
}

/**
 * Cập nhật cache sau khi thay đổi dữ liệu
 * @param {string} courseId - ID khóa học
 * @param {Object} newContents - Nội dung mới
 */
function updateCourseContentsCache(courseId, newContents) {
  return courseContentsCache.set(courseId, newContents);
}

/**
 * Xóa cache khi cần làm mới hoàn toàn
 * @param {string} courseId - ID khóa học hoặc null để xóa toàn bộ
 * @returns {boolean} - Kết quả xóa
 */
function clearCourseContentsCache(courseId) {
  return courseContentsCache.delete(courseId);
}

// Clone đối tượng an toàn
function safeClone(obj) {
  try {
    return typeof structuredClone === 'function'
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));
  } catch (error) {
    console.warn(`[Clone] Lỗi clone đối tượng: ${error.message}`);
    // Tạo bản sao nông đối với các đối tượng phức tạp
    if (obj && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        return [...obj];
      }
      return { ...obj };
    }
    return obj;
  }
}

/**
 * Lấy hoặc tạo mới khóa học
 * @param {string} name - Tên khóa học
 * @param {string} driveUrl - URL của thư mục trên Google Drive
 * @returns {Promise<Object>} - Thông tin về khóa học
 */
export async function getOrCreateCourse(name, driveUrl) {
  const mainStartTime = Date.now();
  let processingTime = 0;
  
  try {
    // Thời gian xử lý truy vấn MongoDB
    const dbStartTime = Date.now();
    // Sử dụng findDocuments để truy vấn MongoDB trực tiếp
    const existingCourses = await findDocuments("courses", { 
      title: { $regex: name, $options: 'i' } 
    });
    const dbTime = Date.now() - dbStartTime;
    console.log(`[KH] Truy vấn DB - ${dbTime}ms`);
    
    // Chỉ tìm khớp chính xác
    const processStartTime = Date.now();
    const course = existingCourses.find(c => c.title.toLowerCase() === name.toLowerCase());
    
    // Nếu tìm thấy khóa học khớp chính xác
    if (course) {
      // Định dạng lại ID nếu là ObjectId
      course.id = course._id.toString();
      course.isExisting = true;
      
      // Cập nhật URL Drive nếu cần
      if (!course.driveUrl || course.driveUrl !== driveUrl) {
        // Sử dụng updateDocument trực tiếp
        const updateStartTime = Date.now();
        await updateDocument(
          "courses",
          { _id: new ObjectId(course.id) },
          { 
            $set: { 
              driveUrl, 
              updatedAt: new Date() 
            } 
          }
        );
        const updateTime = Date.now() - updateStartTime;
        console.log(`[KH] Cập nhật URL Drive - ${updateTime}ms`);
        
        // Cập nhật biến course
        course.driveUrl = driveUrl;
      }
      
      processingTime = Date.now() - processStartTime;
      const totalTime = Date.now() - mainStartTime;
      console.log(`[KH] Xử lý KH "${name}" - ${processingTime}ms`);
      console.log(`[KH] Tổng thời gian "${name}" - ${totalTime}ms`);
      
      // Xóa cache nếu có khi cập nhật khóa học
      clearCourseContentsCache(course.id);
      
      return course;
    } else {
      // Tạo khóa học mới
      const createStartTime = Date.now();
      
      // Tạo slug từ tên khóa học
      const slug = name.toLowerCase()
        .replace(/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a')
        .replace(/[èéẹẻẽêềếệểễ]/g, 'e')
        .replace(/[ìíịỉĩ]/g, 'i')
        .replace(/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o')
        .replace(/[ùúụủũưừứựửữ]/g, 'u')
        .replace(/[ỳýỵỷỹ]/g, 'y')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      processingTime += Date.now() - createStartTime;
      
      // Tạo document khóa học mới
      const courseData = {
        title: name,
        slug: slug,
        driveUrl,
        status: 'draft',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Thêm trực tiếp vào MongoDB
      const insertStartTime = Date.now();
      const result = await insertDocument("courses", courseData);
      
      if (!result || !result.insertedId) {
        throw new Error("Không thể tạo khóa học mới");
      }
      
      // Tạo document trong courseContents
      const courseContentsData = {
        courseId: result.insertedId,
        chapters: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await insertDocument("courseContents", courseContentsData);
      
      // Lưu vào cache luôn
      updateCourseContentsCache(result.insertedId.toString(), courseContentsData);
      
      const insertTime = Date.now() - insertStartTime;
      console.log(`[KH] Lưu DB "${name}" - ${insertTime}ms`);
      
      processingTime += Date.now() - (createStartTime + insertTime);
      const totalTime = Date.now() - mainStartTime;
      console.log(`[KH] Xử lý tạo mới "${name}" - ${processingTime}ms`);
      console.log(`[KH] Tổng thời gian "${name}" - ${totalTime}ms`);
      
      return {
        id: result.insertedId.toString(),
        ...courseData,
        isExisting: false
      };
    }
  } catch (error) {
    const totalTime = Date.now() - mainStartTime;
    console.error(`[Lỗi KH] "${name}": ${error.message} - ${totalTime}ms`);
    throw error;
  }
}

/**
 * Tìm hoặc tạo mới chapter trong khóa học
 * @param {string} courseId - ID của khóa học
 * @param {string} name - Tên chapter
 * @returns {Promise<Object>} - Thông tin chapter
 */
export async function getOrCreateChapter(courseId, name) {
  const startTime = Date.now();
  try {
    // Lấy courseContent từ cache hoặc database
    const courseContent = await getCourseContents(courseId);
    
    // Nếu courseContent không tồn tại, tạo mới
    if (!courseContent) {
      const newChapter = {
        id: new ObjectId().toString(),
        title: name,
        order: 1,
        totalLessons: 0,
        lessons: []
      };
      
      const newCourseContent = {
        courseId: new ObjectId(courseId),
        chapters: [newChapter],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await insertDocument("courseContents", newCourseContent);
      
      // Cập nhật cache
      updateCourseContentsCache(courseId, newCourseContent);
      
      const endTime = Date.now();
      console.log(`[CH] Tạo mới + chương "${name}" - KH ${courseId} - ${endTime - startTime}ms`);
      return { id: newChapter.id, title: newChapter.title, isExisting: false };
    }
    
    // Tìm chapter trong courseContent nếu đã tồn tại
    const existingChapter = courseContent.chapters?.find(chapter => 
      chapter.title.toLowerCase() === name.toLowerCase()
    );
    
    if (existingChapter) {
      const endTime = Date.now();
      console.log(`[CH] Tìm thấy chương "${name}" - KH ${courseId} - ${endTime - startTime}ms`);
      return { 
        id: existingChapter.id, 
        title: existingChapter.title, 
        isExisting: true 
      };
    }
    
    // Nếu không tìm thấy chapter khớp, tạo mới
    const newChapter = {
      id: new ObjectId().toString(),
      title: name,
      order: (courseContent.chapters?.length || 0) + 1,
      lessons: []
    };
    
    // Cập nhật trên bộ nhớ - sử dụng clone an toàn
    const updatedCourseContent = safeClone(courseContent);
    if (!updatedCourseContent.chapters) {
      updatedCourseContent.chapters = [];
    }
    updatedCourseContent.chapters.push(newChapter);
    updatedCourseContent.updatedAt = new Date();
    
    // Thêm chapter mới vào courseContent trong database
    await updateDocument(
      "courseContents",
      { courseId: new ObjectId(courseId) },
      { $push: { chapters: newChapter }, $set: { updatedAt: new Date() } }
    );
    
    // Cập nhật cache
    updateCourseContentsCache(courseId, updatedCourseContent);
    
    const endTime = Date.now();
    console.log(`[CH] Tạo chương "${name}" - KH ${courseId} - ${endTime - startTime}ms`);
    return { id: newChapter.id, title: newChapter.title, isExisting: false };
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Lỗi CH] "${name}": ${error.message} - ${endTime - startTime}ms`);
    throw error;
  }
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
  const startTime = Date.now();
  try {
    // Lấy courseContent từ cache hoặc database
    const courseContent = await getCourseContents(courseId);
    
    if (!courseContent) {
      throw new Error(`Không tìm thấy nội dung khóa học với ID ${courseId}`);
    }
    
    // Tìm chapter
    const chapterIndex = courseContent.chapters.findIndex(ch => ch.id === chapterId);
    
    if (chapterIndex === -1) {
      throw new Error(`Không tìm thấy chapter với ID ${chapterId}`);
    }
    
    const chapter = courseContent.chapters[chapterIndex];
    
    // Tìm lesson nếu đã tồn tại
    const existingLesson = chapter.lessons?.find(lesson => lesson.title === name);
    
    if (existingLesson) {
      const endTime = Date.now();
      console.log(`[BH] Tìm thấy bài "${name}" - CH "${chapter.title}" - ${endTime - startTime}ms`);
      return {
        id: existingLesson.id,
        title: existingLesson.title,
        isExisting: true
      };
    }
    
    // Tạo lesson mới
    const newLesson = {
      id: new ObjectId().toString(),
      title: name,
      order: (chapter.lessons?.length || 0) + 1,
      files: [],
      subfolders: []
    };
    
    // Cập nhật trên bộ nhớ - sử dụng clone an toàn
    const updatedCourseContent = safeClone(courseContent);
    if (!updatedCourseContent.chapters[chapterIndex].lessons) {
      updatedCourseContent.chapters[chapterIndex].lessons = [];
    }
    updatedCourseContent.chapters[chapterIndex].lessons.push(newLesson);
    updatedCourseContent.chapters[chapterIndex].updatedAt = new Date();
    
    // Thêm lesson vào chapter trong database
    await updateDocument(
      "courseContents",
      { courseId: new ObjectId(courseId), "chapters.id": chapterId },
      { 
        $push: { "chapters.$.lessons": newLesson },
        $set: { updatedAt: new Date() }
      }
    );
    
    // Cập nhật cache
    updateCourseContentsCache(courseId, updatedCourseContent);
    
    const endTime = Date.now();
    console.log(`[BH] Tạo bài "${name}" - CH "${chapter.title}" - ${endTime - startTime}ms`);
    return { id: newLesson.id, title: newLesson.title, isExisting: false };
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Lỗi BH] "${name}": ${error.message} - ${endTime - startTime}ms`);
    throw error;
  }
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
  const startTime = Date.now();
  try {
    if (!lessonId) {
      throw new Error(`lessonId không thể null khi tạo subfolder`);
    }

    // Lấy courseContent từ cache hoặc database
    const courseContent = await getCourseContents(courseId);
    
    if (!courseContent || !courseContent.chapters) {
      throw new Error(`Không tìm thấy dữ liệu khóa học với ID ${courseId}`);
    }
    
    // Tìm chapter
    const chapterIndex = courseContent.chapters.findIndex(ch => ch.id === chapterId);
    
    if (chapterIndex === -1) {
      throw new Error(`Không tìm thấy chapter với ID ${chapterId}`);
    }
    
    // Tìm lesson
    const lessonIndex = courseContent.chapters[chapterIndex].lessons.findIndex(lesson => lesson.id === lessonId);
    
    if (lessonIndex === -1) {
      throw new Error(`Không tìm thấy lesson với ID ${lessonId}`);
    }
    
    // Lấy thông tin lesson
    const lesson = courseContent.chapters[chapterIndex].lessons[lessonIndex];
    
    // Tìm subfolder trong lesson nếu đã tồn tại
    const subfolder = lesson.subfolders?.find(sf => sf.name === folderName);
    
    if (subfolder) {
      const endTime = Date.now();
      console.log(`[TM] Tìm thấy TM "${folderName}" - BH "${lesson.title}" - ${endTime - startTime}ms`);
      return subfolder.id;
    }
    
    // Nếu subfolder chưa tồn tại, tạo mới
    const newSubfolder = {
      id: new ObjectId().toString(),
      name: folderName,
      files: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Tạo bản sao của courseContent để cập nhật
    const updatedCourseContent = safeClone(courseContent);
    
    // Tạo trường subfolders nếu chưa có
    if (!lesson.subfolders) {
      // Trong bộ nhớ
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders = [newSubfolder];
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].updatedAt = new Date();
      
      // Trong database
      await updateDocument(
        "courseContents",
        { 
          courseId: new ObjectId(courseId),
          "chapters.id": chapterId,
          "chapters.lessons.id": lessonId
        },
        { 
          $set: { 
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders`]: [newSubfolder],
            updatedAt: new Date()
          }
        }
      );
    } else {
      // Trong bộ nhớ
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders.push(newSubfolder);
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].updatedAt = new Date();
      
      // Trong database
      await updateDocument(
        "courseContents",
        { 
          courseId: new ObjectId(courseId),
          "chapters.id": chapterId,
          "chapters.lessons.id": lessonId
        },
        { 
          $push: { 
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders`]: newSubfolder
          },
          $set: {
            updatedAt: new Date()
          }
        }
      );
    }
    
    // Cập nhật cache
    updateCourseContentsCache(courseId, updatedCourseContent);
    
    const endTime = Date.now();
    console.log(`[TM] Tạo TM "${folderName}" - BH "${lesson.title}" - ${endTime - startTime}ms`);
    return newSubfolder.id;
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Lỗi TM] "${folderName}": ${error.message} - ${endTime - startTime}ms`);
    throw error;
  }
}

/**
 * Tìm hoặc tạo mới thư mục con trong một subfolder
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {string} subfolderId - ID của subfolder cha
 * @param {string} name - Tên thư mục con
 * @returns {Promise<string>} - ID của thư mục con
 */
export async function getOrCreateSubsubfolder(courseId, chapterId, lessonId, subfolderId, name) {
  const startTime = Date.now();
  try {
    if (!lessonId) {
      throw new Error(`lessonId không thể null khi tạo subfolder`);
    }

    // Lấy courseContent từ cache hoặc database
    const courseContent = await getCourseContents(courseId);
    
    if (!courseContent) {
      throw new Error(`Không tìm thấy nội dung khóa học với ID ${courseId}`);
    }
    
    // Tìm chapter trong khóa học
    const chapterIndex = courseContent.chapters.findIndex(c => c.id === chapterId);
    
    if (chapterIndex === -1) {
      throw new Error(`Không tìm thấy chapter với ID ${chapterId}`);
    }
    
    // Tìm lesson trong chapter
    const lessonIndex = courseContent.chapters[chapterIndex].lessons.findIndex(l => l.id === lessonId);
    
    if (lessonIndex === -1) {
      throw new Error(`Không tìm thấy lesson với ID ${lessonId}`);
    }
    
    const lesson = courseContent.chapters[chapterIndex].lessons[lessonIndex];
    
    // Tìm subfolder trong lesson
    if (!lesson.subfolders) {
      lesson.subfolders = [];
    }
    
    const subfolderIndex = lesson.subfolders.findIndex(sf => sf.id === subfolderId);
    
    if (subfolderIndex === -1) {
      throw new Error(`Không tìm thấy subfolder với ID ${subfolderId}`);
    }
    
    const subfolder = lesson.subfolders[subfolderIndex];
    
    // Tạo bản sao của courseContent để cập nhật
    const updatedCourseContent = safeClone(courseContent);
    
    // Đảm bảo subfolder có mảng subfolders
    if (!subfolder.subfolders) {
      // Cập nhật trong bộ nhớ
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].subfolders = [];
      
      // Cập nhật trường subfolders cho subfolder trong database
      await updateDocument(
        "courseContents",
        { 
          courseId: new ObjectId(courseId),
          "chapters.id": chapterId,
          "chapters.lessons.id": lessonId,
          "chapters.lessons.subfolders.id": subfolderId
        },
        { 
          $set: { 
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.subfolders`]: [],
            updatedAt: new Date()
          } 
        }
      );
      
      // Cập nhật cache
      updateCourseContentsCache(courseId, updatedCourseContent);
    }
    
    // Lấy subfolder đã cập nhật từ cache hoặc bộ nhớ
    const updatedSubfolder = updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex];
    
    // Tìm subsubfolder trong subfolder nếu đã tồn tại
    const existingSubsubfolder = updatedSubfolder.subfolders.find(ssf => 
      ssf.name.toLowerCase() === name.toLowerCase()
    );
    
    if (existingSubsubfolder) {
      const endTime = Date.now();
      console.log(`[TMC] Tìm thấy TMC "${name}" - TM "${subfolder.name}" - ${endTime - startTime}ms`);
      return existingSubsubfolder.id;
    }
    
    // Tạo mới subsubfolder
    const newId = new ObjectId().toString();
    const newSubsubfolder = {
      id: newId,
      name: name,
      files: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Thêm subsubfolder vào bộ nhớ
    updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].subfolders.push(newSubsubfolder);
    updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].updatedAt = new Date();
    
    // Thêm subsubfolder vào subfolder trong database
    await updateDocument(
      "courseContents",
      { 
        courseId: new ObjectId(courseId),
        "chapters.id": chapterId,
        "chapters.lessons.id": lessonId,
        "chapters.lessons.subfolders.id": subfolderId
      },
      { 
        $push: { [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.subfolders`]: newSubsubfolder },
        $set: { updatedAt: new Date() } 
      }
    );
    
    // Cập nhật cache
    updateCourseContentsCache(courseId, updatedCourseContent);
    
    const endTime = Date.now();
    console.log(`[TMC] Tạo TMC "${name}" - TM "${subfolder.name}" - ${endTime - startTime}ms`);
    return newId;
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Lỗi TMC] "${name}": ${error.message} - ${endTime - startTime}ms`);
    throw error;
  }
}

/**
 * Kiểm tra file đã tồn tại trong khóa học
 * @param {string} courseId - ID khóa học
 * @param {string} chapterId - ID chapter
 * @param {string} lessonId - ID lesson
 * @param {string} fileName - Tên file cần kiểm tra
 * @param {string} subfolderId - ID subfolder (nếu có)
 * @param {string} subsubfolderId - ID subsubfolder (nếu có)
 * @returns {Promise<Object|null>} - Trả về đối tượng file nếu tồn tại, null nếu không
 */
export async function checkExistingFile(courseId, chapterId, lessonId, fileName, subfolderId = null, subsubfolderId = null) {
  const mainStartTime = Date.now();
  let processingTime = 0;
  
  try {
    // Chuyển đổi fileName sang chữ thường để so sánh
    const processStartTime = Date.now();
    const fileNameLower = fileName.toLowerCase();
    processingTime += Date.now() - processStartTime;
    
    // Lấy courseContent từ cache hoặc database
    const dbStartTime = Date.now();
    const courseContent = await getCourseContents(courseId);
    const dbTime = Date.now() - dbStartTime;
    console.log(`[KT] Truy vấn cache/DB - ${dbTime}ms`);
    
    if (!courseContent) {
      console.log(`[KT] KH ${courseId} không tồn tại - "${fileName}"`);
      return null;
    }
    
    // Thời gian xử lý dữ liệu
    const searchStartTime = Date.now();
    
    // Tìm chapter trong khóa học
    const chapterIndex = courseContent.chapters.findIndex(c => c.id === chapterId);
    
    if (chapterIndex === -1) {
      console.log(`[KT] CH ${chapterId} không tồn tại - "${fileName}"`);
      return null;
    }
    
    // Tìm lesson trong chapter
    const lessonIndex = courseContent.chapters[chapterIndex].lessons.findIndex(l => l.id === lessonId);
    
    if (lessonIndex === -1) {
      console.log(`[KT] BH ${lessonId} không tồn tại - "${fileName}"`);
      return null;
    }
    
    const lesson = courseContent.chapters[chapterIndex].lessons[lessonIndex];
    
    // Biến lưu trữ file đã tìm thấy
    let existingFile = null;
    
    // Tìm file trong lesson hoặc subfolder
    if (subsubfolderId && subfolderId) {
      // Tìm trong subsubfolder
      const subfolder = lesson.subfolders?.find(sf => sf.id === subfolderId);
      if (subfolder) {
        // Kiểm tra xem trường subfolders có tồn tại trong subfolder
        if (!subfolder.subfolders || !Array.isArray(subfolder.subfolders)) {
          console.log(`[KT] TM "${subfolder.name}" không có TM con - "${fileName}"`);
          return null;
        }
        
        const subsubfolder = subfolder.subfolders.find(ssf => ssf.id === subsubfolderId);
        if (subsubfolder) {
          if (!subsubfolder.files || !Array.isArray(subsubfolder.files)) {
            console.log(`[KT] TM con "${subsubfolder.name}" rỗng - "${fileName}"`);
            return null;
          }
          
          // Dùng hàm find với toLowerCase() để tìm không phân biệt chữ hoa/thường
          existingFile = subsubfolder.files.find(f =>
            f.name.toLowerCase() === fileNameLower
          );
        }
      }
    } else if (subfolderId) {
      // Tìm trong subfolder
      const subfolder = lesson.subfolders?.find(sf => sf.id === subfolderId);
      if (subfolder) {
        if (!subfolder.files || !Array.isArray(subfolder.files)) {
          console.log(`[KT] TM "${subfolder.name}" rỗng - "${fileName}"`);
          return null;
        }
        
        // Dùng hàm find với toLowerCase() để tìm không phân biệt chữ hoa/thường
        existingFile = subfolder.files.find(f =>
          f.name.toLowerCase() === fileNameLower
        );
      }
    } else {
      // Tìm trong lesson
      if (!lesson.files || !Array.isArray(lesson.files)) {
        console.log(`[KT] BH "${lesson.title}" rỗng - "${fileName}"`);
        return null;
      }
      
      // Dùng hàm find với toLowerCase() để tìm không phân biệt chữ hoa/thường
      existingFile = lesson.files.find(f =>
        f.name.toLowerCase() === fileNameLower
      );
    }
    
    // Tính thời gian tìm kiếm
    const searchTime = Date.now() - searchStartTime;
    processingTime += searchTime;
    
    // Tổng thời gian
    const totalTime = Date.now() - mainStartTime;
    
    if (existingFile) {
      console.log(`[KT] Tìm thấy "${fileName}" - ${totalTime}ms`);
    } else {
      console.log(`[KT] Không tìm thấy "${fileName}" - ${totalTime}ms`);
    }
    
    return existingFile;
  } catch (error) {
    const totalTime = Date.now() - mainStartTime;
    console.error(`[Lỗi KT] "${fileName}": ${error.message} - ${totalTime}ms`);
    return null;
  }
}

// Giữ lại hàm cũ với tên khác để đảm bảo tương thích ngược
export async function checkAndDeleteDuplicateFiles(courseId, chapterId, lessonId, fileName, subfolderId = null, subsubfolderId = null) {
  console.warn(`DEPRECATED: Hàm checkAndDeleteDuplicateFiles sẽ bị loại bỏ trong phiên bản tới. Sử dụng checkExistingFile thay thế.`);
  return checkExistingFile(courseId, chapterId, lessonId, fileName, subfolderId, subsubfolderId);
}

/**
 * Thêm file vào lesson, subfolder hoặc subsubfolder
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {object} file - Đối tượng file cần thêm
 * @param {string} subfolderId - ID của subfolder (nếu có)
 * @param {string} subsubfolderId - ID của subsubfolder (nếu có)
 * @returns {Promise<object>} - Đối tượng file đã thêm
 */
export async function addFileToLesson(courseId, chapterId, lessonId, file, subfolderId = null, subsubfolderId = null) {
  // Tính thời gian xử lý thuần túy (không tính các hàm con đã log riêng)
  let processingTime = 0;
  const mainStartTime = Date.now();
  
  try {
    // Thời gian xử lý tham số
    const paramStartTime = Date.now();
    if (!chapterId || !lessonId) {
      throw new Error("chapterId và lessonId không thể null");
    }
    
    if (!file || !file.name) {
      throw new Error("File không hợp lệ");
    }
    processingTime += Date.now() - paramStartTime;
    
    // Kiểm tra xem file đã tồn tại chưa (sử dụng cache)
    const checkStartTime = Date.now();
    const existingFile = await checkExistingFile(courseId, chapterId, lessonId, file.name, subfolderId, subsubfolderId);
    const checkTime = Date.now() - checkStartTime;
    // Thời gian checkExistingFile đã được log riêng, không tính vào processingTime
    
    // Nếu file đã tồn tại, trả về file đó thay vì thêm mới
    if (existingFile && existingFile.storage && existingFile.storage.provider === 'wasabi') {
      console.log(`[File] "${file.name}" đã tồn tại - 0ms`);
      return existingFile;
    }
    
    // Lấy courseContent từ cache hoặc database
    const dbStartTime = Date.now();
    const courseContent = await getCourseContents(courseId);
    
    if (!courseContent) {
      throw new Error(`Không tìm thấy nội dung khóa học với ID ${courseId}`);
    }
    
    // Tìm chapter trong khóa học
    const chapterIndex = courseContent.chapters.findIndex(c => c.id === chapterId);
    
    if (chapterIndex === -1) {
      throw new Error(`Không tìm thấy chapter với ID ${chapterId}`);
    }
    
    // Tìm lesson trong chapter
    const lessonIndex = courseContent.chapters[chapterIndex].lessons.findIndex(l => l.id === lessonId);
    
    if (lessonIndex === -1) {
      throw new Error(`Không tìm thấy lesson với ID ${lessonId}`);
    }
    
    const lesson = courseContent.chapters[chapterIndex].lessons[lessonIndex];
    const dbTime = Date.now() - dbStartTime;
    console.log(`[File] Lấy DB/cache "${file.name}" - ${dbTime}ms`);
    
    // Tạo đối tượng file mới
    const fileDataStartTime = Date.now();
    const currentTime = new Date().toISOString();
    const fileData = {
      id: uuidv4(),
      mimeType: file.mimeType || 'application/octet-stream',
      name: file.name,
      originalName: file.originalName || file.name,
      type: file.type || 'unknown',
      uploadTime: currentTime,
      driveFileId: file.id,
      status: 'active',
      size: file.size?.toString() || '0',
      modifiedTime: file.modifiedTime || currentTime
    };
    
    // Nếu có thông tin storage (Wasabi)
    if (file.storage && file.storage.key) {
      fileData.storage = {
        provider: 'wasabi',
        key: file.storage.key,
        size: parseInt(file.size || 0),
        uploadTime: currentTime
      };
    } 
    // Nếu file lấy từ Google Drive
    else if (file.id) {
      fileData.proxyUrl = `https://drive.google.com/uc?id=${file.id}`;
    }
    processingTime += Date.now() - fileDataStartTime;
    
    // Tạo bản sao để cập nhật
    const updatedCourseContent = safeClone(courseContent);
    
    // Thêm file vào đúng vị trí (lesson, subfolder hoặc subsubfolder)
    const updateStartTime = Date.now();
    let updatePath = "";
    let updateObject = {};
    
    if (subsubfolderId && subfolderId) {
      // Thêm file vào subsubfolder
      // Tìm subfolder
      if (!lesson.subfolders) {
        throw new Error(`Lesson không có subfolders`);
      }
      
      const subfolderIndex = lesson.subfolders.findIndex(sf => sf.id === subfolderId);
      if (subfolderIndex === -1) {
        throw new Error(`Không tìm thấy subfolder với ID ${subfolderId}`);
      }
      
      const subfolder = lesson.subfolders[subfolderIndex];
      
      // Tìm subsubfolder
      if (!subfolder.subfolders) {
        throw new Error(`Subfolder không có subsubfolders`);
      }
      
      const subsubfolderIndex = subfolder.subfolders.findIndex(ssf => ssf.id === subsubfolderId);
      if (subsubfolderIndex === -1) {
        throw new Error(`Không tìm thấy subsubfolder với ID ${subsubfolderId}`);
      }
      
      // Cập nhật trong bộ nhớ
      if (!updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].subfolders[subsubfolderIndex].files) {
        updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].subfolders[subsubfolderIndex].files = [];
      }
      
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].subfolders[subsubfolderIndex].files.push(fileData);
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].subfolders[subsubfolderIndex].updatedAt = currentTime;
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].updatedAt = currentTime;
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].updatedAt = currentTime;
      updatedCourseContent.updatedAt = currentTime;
      
      // Thêm file vào subsubfolder trong database
      updatePath = `chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.subfolders.${subsubfolderIndex}.files`;
      updateObject = {
        $push: { [updatePath]: fileData },
        $set: {
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.subfolders.${subsubfolderIndex}.updatedAt`]: currentTime,
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.updatedAt`]: currentTime,
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.updatedAt`]: currentTime,
          updatedAt: currentTime
        }
      };
      
      console.log(`[File] Lưu vào TM con - BH "${lesson.title}"`);
    } else if (subfolderId) {
      // Thêm file vào subfolder
      // Tìm subfolder
      if (!lesson.subfolders) {
        throw new Error(`Lesson không có subfolders`);
      }
      
      const subfolderIndex = lesson.subfolders.findIndex(sf => sf.id === subfolderId);
      if (subfolderIndex === -1) {
        throw new Error(`Không tìm thấy subfolder với ID ${subfolderId}`);
      }
      
      const subfolder = lesson.subfolders[subfolderIndex];
      
      // Cập nhật trong bộ nhớ
      if (!updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].files) {
        updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].files = [];
      }
      
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].files.push(fileData);
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].subfolders[subfolderIndex].updatedAt = currentTime;
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].updatedAt = currentTime;
      updatedCourseContent.updatedAt = currentTime;
      
      // Thêm file vào subfolder trong database
      updatePath = `chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.files`;
      updateObject = {
        $push: { [updatePath]: fileData },
        $set: {
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.updatedAt`]: currentTime,
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.updatedAt`]: currentTime,
          updatedAt: currentTime
        }
      };
      
      console.log(`[File] Lưu vào TM "${subfolder.name}"`);
    } else {
      // Thêm file vào lesson
      // Cập nhật trong bộ nhớ
      if (!updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].files) {
        updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].files = [];
      }
      
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].files.push(fileData);
      updatedCourseContent.chapters[chapterIndex].lessons[lessonIndex].updatedAt = currentTime;
      updatedCourseContent.updatedAt = currentTime;
      
      // Thêm file vào lesson trong database
      updatePath = `chapters.${chapterIndex}.lessons.${lessonIndex}.files`;
      updateObject = {
        $push: { [updatePath]: fileData },
        $set: {
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.updatedAt`]: currentTime,
          updatedAt: currentTime
        }
      };
      
      console.log(`[File] Lưu vào BH "${lesson.title}"`);
    }
    
    // Cập nhật trong database
    await updateDocument(
      "courseContents",
      { courseId: new ObjectId(courseId) },
      updateObject
    );
    
    // Cập nhật cache
    updateCourseContentsCache(courseId, updatedCourseContent);
    
    const updateTime = Date.now() - updateStartTime;
    console.log(`[File] Thời gian cập nhật "${file.name}" - ${updateTime}ms`);
    
    // Thời gian xử lý thuần túy (không tính thời gian của DB và check)
    processingTime += Date.now() - (updateStartTime + updateTime);
    console.log(`[File] Xử lý "${file.name}" - ${processingTime}ms`);
    
    // Tổng thời gian
    const totalTime = Date.now() - mainStartTime;
    console.log(`[File] Tổng thời gian "${file.name}" - ${totalTime}ms`);
    
    return fileData;
  } catch (error) {
    const totalTime = Date.now() - mainStartTime;
    console.error(`[Lỗi File] "${file?.name}": ${error.message} - ${totalTime}ms`);
    throw error;
  }
}

/**
 * Đồng bộ hóa các mục đã xóa
 * @param {string} courseId - ID của khóa học
 * @returns {Promise<Object>} - Kết quả đồng bộ 
 */
export async function synchronizeDeletedItems(courseId) {
  const startTime = Date.now();
  try {
    // Lấy courseContent từ cache hoặc database
    const dbStartTime = Date.now();
    const courseContent = await getCourseContents(courseId);
    const dbEndTime = Date.now();
    console.log(`[Dọn] Lấy dữ liệu KH ${courseId} - ${dbEndTime - dbStartTime}ms`);
    
    if (!courseContent) {
      const endTime = Date.now();
      console.log(`[Dọn] KH ${courseId} không tồn tại - ${endTime - startTime}ms`);
      return { changed: false };
    }
    
    // Lấy danh sách đã xử lý từ syncState
    const processedChapters = global.syncState?.processedItems?.chapters || new Set();
    const processedLessons = global.syncState?.processedItems?.lessons || new Set();
    const processedFiles = global.syncState?.processedItems?.files || new Set();
    const processedSubfolders = global.syncState?.processedItems?.subfolders || new Set();
    
    // Thu thập file cần xóa
    const keysToDelete = [];
    const filesToDeleteFromDB = [];
    
    // Duyệt qua chapters
    const scanStartTime = Date.now();
    if (courseContent.chapters && Array.isArray(courseContent.chapters)) {
      for (const chapter of courseContent.chapters) {
        // Kiểm tra lessons trong chapter
        if (chapter.lessons && Array.isArray(chapter.lessons)) {
          for (const lesson of chapter.lessons) {
            // Kiểm tra files trong lesson
            if (lesson.files && Array.isArray(lesson.files)) {
              for (const file of lesson.files) {
                if (file.storage && file.storage.provider === 'wasabi' && file.storage.key) {
                  if (!processedFiles.has(file.id)) {
                    keysToDelete.push(file.storage.key);
                    filesToDeleteFromDB.push({
                      type: 'lessonFile',
                      chapterId: chapter.id,
                      lessonId: lesson.id,
                      fileId: file.id,
                      fileName: file.name
                    });
                  }
                }
              }
            }
            
            // Kiểm tra subfolders trong lesson
            if (lesson.subfolders && Array.isArray(lesson.subfolders)) {
              for (const subfolder of lesson.subfolders) {
                // Kiểm tra files trong subfolder
                if (subfolder.files && Array.isArray(subfolder.files)) {
                  for (const file of subfolder.files) {
                    if (file.storage && file.storage.provider === 'wasabi' && file.storage.key) {
                      if (!processedFiles.has(file.id)) {
                        keysToDelete.push(file.storage.key);
                        filesToDeleteFromDB.push({
                          type: 'subfolderFile',
                          chapterId: chapter.id,
                          lessonId: lesson.id,
                          subfolderId: subfolder.id,
                          subfolderName: subfolder.name,
                          fileId: file.id,
                          fileName: file.name
                        });
                      }
                    }
                  }
                }
                
                // Kiểm tra subsubfolders trong subfolder
                if (subfolder.subfolders && Array.isArray(subfolder.subfolders)) {
                  for (const subsubfolder of subfolder.subfolders) {
                    // Kiểm tra files trong subsubfolder
                    if (subsubfolder.files && Array.isArray(subsubfolder.files)) {
                      for (const file of subsubfolder.files) {
                        if (file.storage && file.storage.provider === 'wasabi' && file.storage.key) {
                          if (!processedFiles.has(file.id)) {
                            keysToDelete.push(file.storage.key);
                            filesToDeleteFromDB.push({
                              type: 'subsubfolderFile',
                              chapterId: chapter.id,
                              lessonId: lesson.id,
                              subfolderId: subfolder.id,
                              subfolderName: subfolder.name,
                              subsubfolderId: subsubfolder.id,
                              subsubfolderName: subsubfolder.name,
                              fileId: file.id,
                              fileName: file.name
                            });
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Kiểm tra thêm trường sections (cấu trúc cũ có thể sử dụng)
    if (courseContent.sections && Array.isArray(courseContent.sections)) {
      for (const section of courseContent.sections) {
        // Xử lý tương tự như chapters
        if (section.lectures && Array.isArray(section.lectures)) {
          for (const lecture of section.lectures) {
            // Kiểm tra files trong lecture
            if (lecture.files && Array.isArray(lecture.files)) {
              for (const file of lecture.files) {
                if (file.storage && file.storage.provider === 'wasabi' && file.storage.key) {
                  if (!processedFiles.has(file.id)) {
                    keysToDelete.push(file.storage.key);
                    filesToDeleteFromDB.push({
                      type: 'lectureFile',
                      sectionId: section.id,
                      sectionName: section.title,
                      lectureId: lecture.id,
                      lectureName: lecture.title,
                      fileId: file.id,
                      fileName: file.name
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
    const scanEndTime = Date.now();
    console.log(`[Dọn] Quét dữ liệu - Tìm ${keysToDelete.length} file - ${scanEndTime - scanStartTime}ms`);
    
    // Nếu không tìm thấy file cần xóa
    if (keysToDelete.length === 0) {
      // Kiểm tra toàn bộ dữ liệu để tìm khóa Wasabi
      const deepScanStartTime = Date.now();
      let allStorageKeys = [];
      const scanForStorageKeys = (obj) => {
        if (!obj) return;
        
        if (typeof obj === 'object') {
          if (obj.storage && obj.storage.provider === 'wasabi' && obj.storage.key) {
            allStorageKeys.push({
              key: obj.storage.key,
              name: obj.name || 'Không có tên file'
            });
          }
          
          Object.keys(obj).forEach(key => {
            scanForStorageKeys(obj[key]);
          });
        } else if (Array.isArray(obj)) {
          obj.forEach(item => {
            scanForStorageKeys(item);
          });
        }
      };
      
      scanForStorageKeys(courseContent);
      const deepScanEndTime = Date.now();
      console.log(`[Dọn] Quét sâu - Tìm ${allStorageKeys.length} file - ${deepScanEndTime - deepScanStartTime}ms`);
      
      if (allStorageKeys.length > 0) {
        allStorageKeys.forEach(item => {
          keysToDelete.push(item.key);
          console.log(`[Dọn] + File "${item.name}"`);
        });
      } else {
        const endTime = Date.now();
        console.log(`[Dọn] Không có file cần xóa - ${endTime - startTime}ms`);
        return { changed: false };
      }
    }
    
    // Xóa files từ Wasabi - xử lý song song với Promise.all
    const deleteStartTime = Date.now();
    const deletePromises = keysToDelete.map(key => 
      fetch(`/api/storage/delete?key=${encodeURIComponent(key)}`, {
        method: 'DELETE'
      })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          console.log(`[Dọn] Xóa OK ${key}`);
          return { success: true, key };
        } else {
          console.error(`[Dọn] Lỗi xóa ${key}: ${result.error || 'Lỗi không xác định'}`);
          return { success: false, key };
        }
      })
      .catch(error => {
        console.error(`[Dọn] Lỗi xóa ${key}: ${error.message}`);
        return { success: false, key };
      })
    );
    
    // Chờ tất cả các promise hoàn thành
    const deleteResults = await Promise.all(deletePromises);
    
    // Đếm số lượng xóa thành công/thất bại
    const successCount = deleteResults.filter(r => r.success).length;
    const failedCount = deleteResults.filter(r => !r.success).length;
    
    const deleteEndTime = Date.now();
    console.log(`[Dọn] Xóa ${successCount}/${keysToDelete.length} file - ${deleteEndTime - deleteStartTime}ms`);
    
    // Cập nhật MongoDB - xóa các file đã xóa khỏi cấu trúc dữ liệu
    if (filesToDeleteFromDB.length > 0) {
      const updateStartTime = Date.now();
      const updatedCourseContent = safeClone(courseContent);
      
      for (const fileToDelete of filesToDeleteFromDB) {
        const chapterIndex = updatedCourseContent.chapters.findIndex(c => c.id === fileToDelete.chapterId);
        if (chapterIndex === -1) continue;
        
        const chapter = updatedCourseContent.chapters[chapterIndex];
        const lessonIndex = chapter.lessons.findIndex(l => l.id === fileToDelete.lessonId);
        if (lessonIndex === -1) continue;
        
        const lesson = chapter.lessons[lessonIndex];
        
        if (fileToDelete.type === 'lessonFile') {
          const fileIndex = lesson.files.findIndex(f => f.id === fileToDelete.fileId);
          if (fileIndex !== -1) {
            console.log(`[Dọn] Xóa DB "${fileToDelete.fileName}" - BH`);
            lesson.files.splice(fileIndex, 1);
          }
        } else if (fileToDelete.type === 'subfolderFile') {
          const subfolderIndex = lesson.subfolders.findIndex(s => s.id === fileToDelete.subfolderId);
          if (subfolderIndex !== -1) {
            const subfolder = lesson.subfolders[subfolderIndex];
            const fileIndex = subfolder.files.findIndex(f => f.id === fileToDelete.fileId);
            if (fileIndex !== -1) {
              console.log(`[Dọn] Xóa DB "${fileToDelete.fileName}" - TM "${fileToDelete.subfolderName}"`);
              subfolder.files.splice(fileIndex, 1);
            }
          }
        } else if (fileToDelete.type === 'subsubfolderFile') {
          const subfolderIndex = lesson.subfolders.findIndex(s => s.id === fileToDelete.subfolderId);
          if (subfolderIndex !== -1) {
            const subfolder = lesson.subfolders[subfolderIndex];
            const subsubfolderIndex = subfolder.subfolders?.findIndex(ss => ss.id === fileToDelete.subsubfolderId);
            if (subsubfolderIndex !== -1) {
              const subsubfolder = subfolder.subfolders[subsubfolderIndex];
              const fileIndex = subsubfolder.files.findIndex(f => f.id === fileToDelete.fileId);
              if (fileIndex !== -1) {
                console.log(`[Dọn] Xóa DB "${fileToDelete.fileName}" - TM con "${fileToDelete.subsubfolderName}"`);
                subsubfolder.files.splice(fileIndex, 1);
              }
            }
          }
        }
      }
      
      // Cập nhật dữ liệu trong MongoDB
      await updateDocument(
        "courseContents",
        { courseId: new ObjectId(courseId) },
        { $set: { chapters: updatedCourseContent.chapters, updatedAt: new Date().toISOString() } }
      );
      
      // Cập nhật cache
      updateCourseContentsCache(courseId, updatedCourseContent);
      
      const updateEndTime = Date.now();
      console.log(`[Dọn] Cập nhật DB - ${updateEndTime - updateStartTime}ms`);
    }
    
    // Xóa thư mục trống nếu cần - sử dụng Promise.all để xử lý song song
    if (successCount > 0) {
      const folderDeleteStartTime = Date.now();
      // Các đường dẫn thư mục có thể có
      const folderPaths = [
        `courses/${courseId}/`,
        `course/${courseId}/`
      ];
      
      // Gọi API để xóa các thư mục song song
      const folderDeletePromises = folderPaths.map(folderPath => 
        fetch(`/api/storage/delete?key=${encodeURIComponent(folderPath)}`, {
          method: 'DELETE'
        })
        .then(response => response.json())
        .then(result => {
          if (result.success) {
            console.log(`[Dọn] Xóa thư mục ${folderPath}`);
            return true;
          }
          return false;
        })
        .catch(error => {
          console.log(`[Dọn] Lỗi xóa TM ${folderPath}: ${error.message}`);
          return false;
        })
      );
      
      // Chờ tất cả các promise hoàn thành
      const folderDeleteResults = await Promise.all(folderDeletePromises);
      
      // Đếm số thư mục đã xóa
      const deletedFolders = folderDeleteResults.filter(r => r).length;
      
      const folderDeleteEndTime = Date.now();
      console.log(`[Dọn] Xóa ${deletedFolders} thư mục - ${folderDeleteEndTime - folderDeleteStartTime}ms`);
    }
    
    const endTime = Date.now();
    console.log(`[Dọn] Hoàn thành KH ${courseId} - ${endTime - startTime}ms`);
    
    // Xóa cache để làm mới dữ liệu
    clearCourseContentsCache(courseId);
    
    return {
      changed: true,
      deletedFilesCount: successCount,
      failedDeletionsCount: failedCount
    };
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Dọn] Lỗi KH ${courseId}: ${error.message} - ${endTime - startTime}ms`);
    return {
      changed: false,
      error: error.message
    };
  }
}

/**
 * Lấy loại file dựa vào mime type
 * Reuse từ file utils để đảm bảo tính nhất quán
 */
export { getFileType }; 