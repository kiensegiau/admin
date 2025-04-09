/**
 * Triển khai import course từ Google Drive với adapter cho MongoDB
 */

import { CourseAdapter } from '@/lib/adapters/course-adapter';
import { findOneDocument, findDocuments, insertDocument, updateDocument, connectToDatabase, ObjectId } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { getFileType } from './utils';

/**
 * Lấy hoặc tạo mới khóa học
 * @param {string} name - Tên khóa học
 * @param {string} driveUrl - URL của thư mục trên Google Drive
 * @returns {Promise<Object>} - Thông tin về khóa học
 */
export async function getOrCreateCourse(name, driveUrl) {
  const startTime = Date.now();
  try {
    // Sử dụng findDocuments để truy vấn MongoDB trực tiếp
    const existingCourses = await findDocuments("courses", { 
      title: { $regex: name, $options: 'i' } 
    });
    
    // Chỉ tìm khớp chính xác
    const course = existingCourses.find(c => c.title.toLowerCase() === name.toLowerCase());
    
    // Nếu tìm thấy khóa học khớp chính xác
    if (course) {
      // Định dạng lại ID nếu là ObjectId
      course.id = course._id.toString();
      course.isExisting = true;
      
      // Cập nhật URL Drive nếu cần
      if (!course.driveUrl || course.driveUrl !== driveUrl) {
        // Sử dụng updateDocument trực tiếp
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
        
        // Cập nhật biến course
        course.driveUrl = driveUrl;
      }
      
      const endTime = Date.now();
      console.log(`[KH] Lấy KH "${name}" - ${endTime - startTime}ms`);
      return course;
    } else {
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
      const result = await insertDocument("courses", courseData);
      
      if (!result || !result.insertedId) {
        throw new Error("Không thể tạo khóa học mới");
      }
      
      // Tạo document trong courseContents
      await insertDocument("courseContents", {
        courseId: result.insertedId,
        chapters: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`Tạo KH "${name}" - ID: ${result.insertedId}`);
      
      const endTime = Date.now();
      console.log(`[KH] Tạo mới "${name}" - ${endTime - startTime}ms`);
      return {
        id: result.insertedId.toString(),
        ...courseData,
        isExisting: false
      };
    }
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Lỗi KH] "${name}": ${error.message} - ${endTime - startTime}ms`);
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
    // Tìm courseContent theo courseId
    const courseContent = await findOneDocument("courseContents", { courseId: new ObjectId(courseId) });
    
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
      
      const endTime = Date.now();
      console.log(`[CH] Tạo mới + chương "${name}" - KH ${courseId} - ${endTime - startTime}ms`);
      return { id: newChapter.id, title: newChapter.title, isExisting: false };
    }
    
    // Tìm chapter trong courseContent nếu đã tồn tại
    const existingChapter = courseContent.chapters?.find(chapter => chapter.title === name);
    
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
    
    // Thêm chapter mới vào courseContent
    await updateDocument(
      "courseContents",
      { courseId: new ObjectId(courseId) },
      { $push: { chapters: newChapter }, $set: { updatedAt: new Date() } }
    );
    
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
    // Tìm courseContent và chapter
    const courseContent = await findOneDocument("courseContents", { 
      courseId: new ObjectId(courseId),
      "chapters.id": chapterId
    });
    
    if (!courseContent) {
      throw new Error(`Không tìm thấy chapter với ID ${chapterId} trong khóa học ${courseId}`);
    }
    
    // Tìm chapter
    const chapter = courseContent.chapters.find(ch => ch.id === chapterId);
    
    if (!chapter) {
      throw new Error(`Không tìm thấy chapter với ID ${chapterId}`);
    }
    
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
    
    // Thêm lesson vào chapter
    await updateDocument(
      "courseContents",
      { courseId: new ObjectId(courseId), "chapters.id": chapterId },
      { 
        $push: { "chapters.$.lessons": newLesson },
        $set: { updatedAt: new Date() }
      }
    );
    
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

    // Tìm courseContent theo courseId
    const courseContent = await findOneDocument("courseContents", { 
      courseId: new ObjectId(courseId)
    });
    
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
    
    // Tạo trường subfolders nếu chưa có
    if (!lesson.subfolders) {
      // Nếu lesson không có trường subfolders, cần thêm vào
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
      // Thêm subfolder mới vào mảng subfolders hiện có
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
  const startTime = Date.now();
  try {
    // Chuyển đổi fileName sang chữ thường để so sánh
    const fileNameLower = fileName.toLowerCase();
    
    // Kết nối đến MongoDB
    await connectToDatabase();
    
    // Tìm courseContent trong MongoDB
    const courseContent = await findOneDocument("courseContents", { 
      courseId: new ObjectId(courseId)
    });
    
    if (!courseContent) {
      const endTime = Date.now();
      console.log(`[KT] KH ${courseId} không tồn tại - File "${fileName}" - ${endTime - startTime}ms`);
      return null;
    }
    
    // Tìm chapter trong khóa học
    const chapterIndex = courseContent.chapters.findIndex(c => c.id === chapterId);
    
    if (chapterIndex === -1) {
      const endTime = Date.now();
      console.log(`[KT] CH ${chapterId} không tồn tại - File "${fileName}" - ${endTime - startTime}ms`);
      return null;
    }
    
    // Tìm lesson trong chapter
    const lessonIndex = courseContent.chapters[chapterIndex].lessons.findIndex(l => l.id === lessonId);
    
    if (lessonIndex === -1) {
      const endTime = Date.now();
      console.log(`[KT] BH ${lessonId} không tồn tại - File "${fileName}" - ${endTime - startTime}ms`);
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
          const endTime = Date.now();
          console.log(`[KT] TM "${subfolder.name}" không có TM con - File "${fileName}" - ${endTime - startTime}ms`);
          return null;
        }
        
        const subsubfolder = subfolder.subfolders.find(ssf => ssf.id === subsubfolderId);
        if (subsubfolder) {
          if (!subsubfolder.files || !Array.isArray(subsubfolder.files)) {
            const endTime = Date.now();
            console.log(`[KT] TM con "${subsubfolder.name}" rỗng - File "${fileName}" - ${endTime - startTime}ms`);
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
          const endTime = Date.now();
          console.log(`[KT] TM "${subfolder.name}" rỗng - File "${fileName}" - ${endTime - startTime}ms`);
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
        const endTime = Date.now();
        console.log(`[KT] BH "${lesson.title}" rỗng - File "${fileName}" - ${endTime - startTime}ms`);
        return null;
      }
      
      // Dùng hàm find với toLowerCase() để tìm không phân biệt chữ hoa/thường
      existingFile = lesson.files.find(f =>
        f.name.toLowerCase() === fileNameLower
      );
    }
    
    const endTime = Date.now();
    if (existingFile) {
      console.log(`[KT] Tìm thấy "${fileName}" - ${endTime - startTime}ms`);
    } else {
      console.log(`[KT] Không tìm thấy "${fileName}" - ${endTime - startTime}ms`);
    }
    return existingFile;
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Lỗi KT] "${fileName}": ${error.message} - ${endTime - startTime}ms`);
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
  const startTime = Date.now();
  try {
    if (!chapterId || !lessonId) {
      throw new Error("chapterId và lessonId không thể null");
    }
    
    if (!file || !file.name) {
      throw new Error("File không hợp lệ");
    }
    
    // Kết nối đến MongoDB
    await connectToDatabase();
    
    // Tìm courseContent trong MongoDB
    const courseContent = await findOneDocument("courseContents", { 
      courseId: new ObjectId(courseId)
    });
    
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
    
    // Kiểm tra xem file đã tồn tại chưa
    const checkStartTime = Date.now();
    const existingFile = await checkExistingFile(courseId, chapterId, lessonId, file.name, subfolderId, subsubfolderId);
    const checkEndTime = Date.now();
    console.log(`[File] KT "${file.name}" - ${checkEndTime - checkStartTime}ms`);
    
    // Nếu file đã tồn tại, trả về file đó thay vì thêm mới
    if (existingFile && existingFile.storage && existingFile.storage.provider === 'wasabi') {
      const endTime = Date.now();
      console.log(`[File] "${file.name}" đã tồn tại - ${endTime - startTime}ms`);
      return existingFile;
    }
    
    // Tạo đối tượng file mới
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
    
    const updateStartTime = Date.now();
    // Thêm file vào đúng vị trí (lesson, subfolder hoặc subsubfolder)
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
      
      // Thêm file vào subsubfolder
      await updateDocument(
        "courseContents",
        {
          courseId: new ObjectId(courseId),
          "chapters.id": chapterId,
          "chapters.lessons.id": lessonId,
          "chapters.lessons.subfolders.id": subfolderId,
          "chapters.lessons.subfolders.subfolders.id": subsubfolderId
        },
        {
          $push: {
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.subfolders.${subsubfolderIndex}.files`]: fileData
          },
          $set: {
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.subfolders.${subsubfolderIndex}.updatedAt`]: currentTime,
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.updatedAt`]: currentTime,
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.updatedAt`]: currentTime,
            updatedAt: currentTime
          }
        }
      );
      
      const updateEndTime = Date.now();
      console.log(`[File] Thêm "${file.name}" vào TM con - BH "${lesson.title}" - ${updateEndTime - updateStartTime}ms`);
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
      
      // Thêm file vào subfolder
      await updateDocument(
        "courseContents",
        {
          courseId: new ObjectId(courseId),
          "chapters.id": chapterId,
          "chapters.lessons.id": lessonId,
          "chapters.lessons.subfolders.id": subfolderId
        },
        {
          $push: {
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.files`]: fileData
          },
          $set: {
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.updatedAt`]: currentTime,
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.updatedAt`]: currentTime,
            updatedAt: currentTime
          }
        }
      );
      
      const updateEndTime = Date.now();
      console.log(`[File] Thêm "${file.name}" vào TM "${subfolder.name}" - ${updateEndTime - updateStartTime}ms`);
    } else {
      // Thêm file vào lesson
      await updateDocument(
        "courseContents",
        {
          courseId: new ObjectId(courseId),
          "chapters.id": chapterId,
          "chapters.lessons.id": lessonId
        },
        {
          $push: {
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.files`]: fileData
          },
          $set: {
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.updatedAt`]: currentTime,
            updatedAt: currentTime
          }
        }
      );
      
      const updateEndTime = Date.now();
      console.log(`[File] Thêm "${file.name}" vào BH "${lesson.title}" - ${updateEndTime - updateStartTime}ms`);
    }
    
    const endTime = Date.now();
    console.log(`[File] OK "${file.name}" - ${endTime - startTime}ms`);
    return fileData;
  } catch (error) {
    const endTime = Date.now();
    console.error(`[Lỗi File] "${file?.name}": ${error.message} - ${endTime - startTime}ms`);
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
    // Kết nối đến MongoDB
    const dbStartTime = Date.now();
    await connectToDatabase();
    const dbEndTime = Date.now();
    console.log(`[Dọn] Kết nối DB - ${dbEndTime - dbStartTime}ms`);
    
    // Lấy dữ liệu từ collection courseContents
    const findStartTime = Date.now();
    const courseContent = await findOneDocument("courseContents", { 
      courseId: new ObjectId(courseId) 
    });
    const findEndTime = Date.now();
    console.log(`[Dọn] Lấy KH ${courseId} - ${findEndTime - findStartTime}ms`);
    
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
    
    // Xóa files từ Wasabi
    let successCount = 0;
    let failedCount = 0;
    
    const deleteStartTime = Date.now();
    for (const key of keysToDelete) {
      try {
        const response = await fetch(`/api/storage/delete?key=${encodeURIComponent(key)}`, {
          method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
          successCount++;
          console.log(`[Dọn] Xóa OK ${key}`);
        } else {
          console.error(`[Dọn] Lỗi xóa ${key}: ${result.error || 'Lỗi không xác định'}`);
          failedCount++;
        }
      } catch (error) {
        console.error(`[Dọn] Lỗi xóa ${key}: ${error.message}`);
        failedCount++;
      }
    }
    const deleteEndTime = Date.now();
    console.log(`[Dọn] Xóa ${successCount}/${keysToDelete.length} file - ${deleteEndTime - deleteStartTime}ms`);
    
    // Cập nhật MongoDB - xóa các file đã xóa khỏi cấu trúc dữ liệu
    if (filesToDeleteFromDB.length > 0) {
      const updateStartTime = Date.now();
      const updatedChapters = JSON.parse(JSON.stringify(courseContent.chapters));
      
      for (const fileToDelete of filesToDeleteFromDB) {
        const chapterIndex = updatedChapters.findIndex(c => c.id === fileToDelete.chapterId);
        if (chapterIndex === -1) continue;
        
        const chapter = updatedChapters[chapterIndex];
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
        { courseId: new ObjectId(courseId) },
        { $set: { chapters: updatedChapters, updatedAt: new Date().toISOString() } },
        { new: true }
      );
      const updateEndTime = Date.now();
      console.log(`[Dọn] Cập nhật DB - ${updateEndTime - updateStartTime}ms`);
    }
    
    // Xóa thư mục trống nếu cần
    try {
      if (successCount > 0) {
        const folderDeleteStartTime = Date.now();
        // Các đường dẫn thư mục có thể có
        const folderPaths = [
          `courses/${courseId}/`,
          `course/${courseId}/`
        ];
        
        let deletedFolders = 0;
        
        // Gọi API để xóa các thư mục
        for (const folderPath of folderPaths) {
          try {
            const response = await fetch(`/api/storage/delete?key=${encodeURIComponent(folderPath)}`, {
              method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
              deletedFolders++;
              console.log(`[Dọn] Xóa thư mục ${folderPath}`);
            }
          } catch (error) {
            console.log(`[Dọn] Lỗi xóa TM ${folderPath}: ${error.message}`);
          }
        }
        const folderDeleteEndTime = Date.now();
        console.log(`[Dọn] Xóa ${deletedFolders} thư mục - ${folderDeleteEndTime - folderDeleteStartTime}ms`);
      }
    } catch (error) {
      console.error(`[Dọn] Lỗi xóa thư mục: ${error.message}`);
    }
    
    const endTime = Date.now();
    console.log(`[Dọn] Hoàn thành KH ${courseId} - ${endTime - startTime}ms`);
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