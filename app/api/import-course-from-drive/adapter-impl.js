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
  try {
    // Sử dụng findDocuments để truy vấn MongoDB trực tiếp
    const existingCourses = await findDocuments("courses", { 
      title: { $regex: name, $options: 'i' } 
    });
    
    // Chỉ tìm khớp chính xác
    const course = existingCourses.find(c => c.title.toLowerCase() === name.toLowerCase());
    
    // Nếu tìm thấy khóa học khớp chính xác
    if (course) {
      console.log(`Đã tìm thấy khóa học khớp chính xác: ${course.title} (ID: ${course._id})`);
      
      // Định dạng lại ID nếu là ObjectId
      course.id = course._id.toString();
      course.isExisting = true;
      
      // Cập nhật URL Drive nếu cần
      if (!course.driveUrl || course.driveUrl !== driveUrl) {
        console.log(`Cập nhật URL Drive: ${driveUrl}`);
        
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
      
      return course;
    } else {
      console.log(`Không tìm thấy khóa học khớp chính xác với tên: "${name}". Tạo mới...`);
      
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
      
      console.log(`Đã tạo khóa học mới với ID: ${result.insertedId}`);
      
      return {
        id: result.insertedId.toString(),
        ...courseData,
        isExisting: false
      };
    }
  } catch (error) {
    console.error(`Lỗi khi lấy hoặc tạo khóa học: ${error.message}`);
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
    return { id: newChapter.id, title: newChapter.title, isExisting: false };
  }
  
  // Tìm chapter trong courseContent nếu đã tồn tại
  const existingChapter = courseContent.chapters?.find(chapter => chapter.title === name);
  
  if (existingChapter) {
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
  
  return { id: newChapter.id, title: newChapter.title, isExisting: false };
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
  
  return { id: newLesson.id, title: newLesson.title, isExisting: false };
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
  
  return newSubfolder.id;
}

/**
 * Tạo hoặc lấy subfolder bên trong subfolder khác
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {string} subfolderId - ID của subfolder cha
 * @param {string} folderName - Tên của subfolder con
 * @returns {Promise<string>} - ID của subfolder con
 */
export async function getOrCreateSubsubfolder(courseId, chapterId, lessonId, subfolderId, folderName) {
  if (!lessonId) {
    throw new Error(`lessonId không thể null khi tạo subsubfolder`);
  }
  
  if (!subfolderId) {
    throw new Error(`subfolderId không thể null khi tạo subsubfolder`);
  }
  
  if (!folderName) {
    throw new Error(`folderName không thể rỗng khi tạo subsubfolder`);
  }
  
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
  
  // Tìm subfolder cha
  if (!lesson.subfolders || !Array.isArray(lesson.subfolders)) {
    throw new Error(`Lesson không có subfolders hoặc subfolders không phải mảng`);
  }
  
  const subfolderIndex = lesson.subfolders.findIndex(sf => sf.id === subfolderId);
  
  if (subfolderIndex === -1) {
    throw new Error(`Không tìm thấy subfolder cha với ID ${subfolderId}`);
  }
  
  const subfolder = lesson.subfolders[subfolderIndex];
  
  // Tìm subsubfolder trong subfolder nếu đã tồn tại
  if (subfolder.subfolders && Array.isArray(subfolder.subfolders)) {
    const subsubfolder = subfolder.subfolders.find(ssf => ssf.name === folderName);
    
    if (subsubfolder) {
      return subsubfolder.id;
    }
  }
  
  // Nếu subsubfolder chưa tồn tại, tạo mới
  const currentTime = new Date().toISOString();
  const newSubsubfolder = {
    id: uuidv4(),
    name: folderName,
    files: [],
    createdAt: currentTime,
    updatedAt: currentTime
  };
  
  // Cập nhật MongoDB dựa trên cấu trúc hiện tại
  if (!subfolder.subfolders) {
    // Nếu subfolder không có trường subfolders, cần thêm vào
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
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.subfolders`]: [newSubsubfolder],
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.updatedAt`]: currentTime,
          updatedAt: currentTime
        }
      }
    );
  } else {
    // Thêm subsubfolder mới vào mảng subfolders hiện có
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
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.subfolders`]: newSubsubfolder
        },
        $set: {
          [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.updatedAt`]: currentTime,
          updatedAt: currentTime
        }
      }
    );
  }
  
  console.log(`Đã tạo subsubfolder "${folderName}" trong subfolder ID ${subfolderId}`);
  
  return newSubsubfolder.id;
}

/**
 * Kiểm tra file đã tồn tại
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {string} fileName - Tên file cần kiểm tra
 * @param {string} subfolderId - ID của subfolder (nếu có)
 * @param {string} subsubfolderId - ID của subsubfolder (nếu có)
 * @returns {Promise<object|null>} - Đối tượng file đã tồn tại hoặc null
 */
export async function checkExistingFile(courseId, chapterId, lessonId, fileName, subfolderId = null, subsubfolderId = null) {
  try {
    // Kết nối đến MongoDB
    await connectToDatabase();
    
    // Tìm courseContent trong MongoDB
    const courseContent = await findOneDocument("courseContents", { 
      courseId: new ObjectId(courseId)
    });
    
    if (!courseContent) {
      console.log(`Không tìm thấy nội dung khóa học với ID ${courseId}`);
      return null;
    }
    
    // Tìm chapter trong khóa học
    const chapterIndex = courseContent.chapters.findIndex(c => c.id === chapterId);
    
    if (chapterIndex === -1) {
      console.log(`Không tìm thấy chapter với ID ${chapterId}`);
      return null;
    }
    
    // Tìm lesson trong chapter
    const lessonIndex = courseContent.chapters[chapterIndex].lessons.findIndex(l => l.id === lessonId);
    
    if (lessonIndex === -1) {
      console.log(`Không tìm thấy lesson với ID ${lessonId}`);
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
        const subsubfolder = subfolder.subfolders?.find(ssf => ssf.id === subsubfolderId);
        if (subsubfolder) {
          existingFile = subsubfolder.files?.find(f =>
            f.name.toLowerCase() === fileName.toLowerCase()
          );
        }
      }
    } else if (subfolderId) {
      // Tìm trong subfolder
      const subfolder = lesson.subfolders?.find(sf => sf.id === subfolderId);
      if (subfolder) {
        existingFile = subfolder.files?.find(f =>
          f.name.toLowerCase() === fileName.toLowerCase()
        );
      }
    } else {
      // Tìm trong lesson
      existingFile = lesson.files?.find(f =>
        f.name.toLowerCase() === fileName.toLowerCase()
      );
    }
    
    if (existingFile) {
      console.log(`Tìm thấy file có cùng tên "${fileName}" đã tồn tại trong database`);
      if (existingFile.storage && existingFile.storage.provider === 'wasabi' && existingFile.storage.key) {
        console.log(`File đã tồn tại trên Wasabi với key: ${existingFile.storage.key}`);
      }
    }
    
    return existingFile;
  } catch (error) {
    console.error(`Lỗi khi kiểm tra file đã tồn tại: ${error.message}`);
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
    const existingFile = await checkExistingFile(courseId, chapterId, lessonId, file.name, subfolderId, subsubfolderId);
    
    // Nếu file đã tồn tại, trả về file đó thay vì thêm mới
    if (existingFile && existingFile.storage && existingFile.storage.provider === 'wasabi') {
      console.log(`File ${file.name} đã tồn tại, không thêm mới.`);
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
      
      console.log(`Đã thêm file ${file.name} vào subsubfolder ID ${subsubfolderId}`);
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
      
      console.log(`Đã thêm file ${file.name} vào subfolder ID ${subfolderId}`);
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
      
      console.log(`Đã thêm file ${file.name} vào lesson ID ${lessonId}`);
    }
    
    return fileData;
  } catch (error) {
    console.error(`Lỗi khi thêm file ${file?.name} vào lesson: ${error.message}`);
    throw error;
  }
}

/**
 * Đồng bộ hóa các mục đã xóa
 * @param {string} courseId - ID của khóa học
 * @returns {Promise<Object>} - Kết quả đồng bộ 
 */
export async function synchronizeDeletedItems(courseId) {
  try {
    console.log(`==================== ĐỒNG BỘ HÓA CÁC MỤC ĐÃ XÓA ====================`);
    console.log(`Đang đồng bộ hóa các mục đã xóa cho khóa học ${courseId}`);
    
    // Kết nối đến MongoDB
    await connectToDatabase();
    
    // Lấy dữ liệu từ collection courseContents
    const courseContent = await findOneDocument("courseContents", { 
      courseId: new ObjectId(courseId) 
    });
    
    if (!courseContent) {
      console.log(`Không tìm thấy nội dung khóa học với ID ${courseId}`);
      return { changed: false };
    }
    
    // In ra cấu trúc chi tiết để debug
    console.log(`Tìm thấy nội dung khóa học (ID: ${courseContent._id})`);
    console.log(`Chi tiết dữ liệu: courseId=${courseContent.courseId}, có chapters=${!!courseContent.chapters}, độ dài=${courseContent.chapters?.length || 0}`);
    console.log(`Kiểm tra đồng bộ: ${JSON.stringify({
      hasChapters: !!courseContent.chapters,
      isChaptersArray: Array.isArray(courseContent.chapters),
      chaptersLength: Array.isArray(courseContent.chapters) ? courseContent.chapters.length : 0
    })}`);
    
    // Lấy danh sách đã xử lý từ syncState
    const processedChapters = global.syncState?.processedItems?.chapters || new Set();
    const processedLessons = global.syncState?.processedItems?.lessons || new Set();
    const processedFiles = global.syncState?.processedItems?.files || new Set();
    const processedSubfolders = global.syncState?.processedItems?.subfolders || new Set();
    
    console.log(`processedFiles có ${processedFiles.size} mục`);
    
    // Thu thập file cần xóa
    const keysToDelete = [];
    const filesToDeleteFromDB = [];
    
    // Duyệt qua chapters
    if (courseContent.chapters && Array.isArray(courseContent.chapters)) {
      for (const chapter of courseContent.chapters) {
        console.log(`Xử lý chapter: ${chapter.name || chapter.title || chapter.id}`);
        
        // Kiểm tra lessons trong chapter
        if (chapter.lessons && Array.isArray(chapter.lessons)) {
          for (const lesson of chapter.lessons) {
            console.log(`  Xử lý lesson: ${lesson.name || lesson.title || lesson.id}`);
            
            // Kiểm tra files trong lesson
            if (lesson.files && Array.isArray(lesson.files)) {
              console.log(`    Tìm thấy ${lesson.files.length} file trong lesson`);
              for (const file of lesson.files) {
                if (file.storage && file.storage.provider === 'wasabi' && file.storage.key) {
                  console.log(`    Kiểm tra file: ${file.name}, id: ${file.id}, đã xử lý: ${processedFiles.has(file.id)}`);
                  
                  if (!processedFiles.has(file.id)) {
                    console.log(`    Thêm file để xóa: ${file.name}, key: ${file.storage.key}`);
                    keysToDelete.push(file.storage.key);
                    filesToDeleteFromDB.push({
                      type: 'lessonFile',
                      chapterId: chapter.id,
                      lessonId: lesson.id,
                      fileId: file.id
                    });
                  }
                } else {
                  console.log(`    File không có storage hoặc không phải Wasabi: ${file.name}`);
                }
              }
            } else {
              console.log(`    Không tìm thấy files trong lesson hoặc không phải array`);
            }
            
            // Kiểm tra subfolders trong lesson
            if (lesson.subfolders && Array.isArray(lesson.subfolders)) {
              console.log(`    Tìm thấy ${lesson.subfolders.length} subfolder trong lesson`);
              for (const subfolder of lesson.subfolders) {
                console.log(`      Xử lý subfolder: ${subfolder.name}, id: ${subfolder.id}`);
                
                // Kiểm tra files trong subfolder
                if (subfolder.files && Array.isArray(subfolder.files)) {
                  console.log(`        Tìm thấy ${subfolder.files.length} file trong subfolder`);
                  for (const file of subfolder.files) {
                    if (file.storage && file.storage.provider === 'wasabi' && file.storage.key) {
                      console.log(`        Kiểm tra file: ${file.name}, id: ${file.id}, đã xử lý: ${processedFiles.has(file.id)}`);
                      
                      if (!processedFiles.has(file.id)) {
                        console.log(`        Thêm file để xóa từ subfolder: ${file.name}, key: ${file.storage.key}`);
                        keysToDelete.push(file.storage.key);
                        filesToDeleteFromDB.push({
                          type: 'subfolderFile',
                          chapterId: chapter.id,
                          lessonId: lesson.id,
                          subfolderId: subfolder.id,
                          fileId: file.id
                        });
                      }
                    } else {
                      console.log(`        File không có storage hoặc không phải Wasabi: ${file.name}`);
                    }
                  }
                } else {
                  console.log(`        Không tìm thấy files trong subfolder hoặc không phải array`);
                }
                
                // Kiểm tra subsubfolders trong subfolder
                if (subfolder.subfolders && Array.isArray(subfolder.subfolders)) {
                  console.log(`        Tìm thấy ${subfolder.subfolders.length} subsubfolder trong subfolder`);
                  
                  for (const subsubfolder of subfolder.subfolders) {
                    console.log(`          Xử lý subsubfolder: ${subsubfolder.name}, id: ${subsubfolder.id}`);
                    
                    // Kiểm tra files trong subsubfolder
                    if (subsubfolder.files && Array.isArray(subsubfolder.files)) {
                      console.log(`            Tìm thấy ${subsubfolder.files.length} file trong subsubfolder`);
                      
                      for (const file of subsubfolder.files) {
                        if (file.storage && file.storage.provider === 'wasabi' && file.storage.key) {
                          console.log(`            Kiểm tra file: ${file.name}, id: ${file.id}, đã xử lý: ${processedFiles.has(file.id)}`);
                          
                          if (!processedFiles.has(file.id)) {
                            console.log(`            Thêm file để xóa từ subsubfolder: ${file.name}, key: ${file.storage.key}`);
                            keysToDelete.push(file.storage.key);
                            filesToDeleteFromDB.push({
                              type: 'subsubfolderFile',
                              chapterId: chapter.id,
                              lessonId: lesson.id,
                              subfolderId: subfolder.id,
                              subsubfolderId: subsubfolder.id,
                              fileId: file.id
                            });
                          }
                        } else {
                          console.log(`            File không có storage hoặc không phải Wasabi: ${file.name}`);
                        }
                      }
                    } else {
                      console.log(`            Không tìm thấy files trong subsubfolder hoặc không phải array`);
                    }
                  }
                } else {
                  console.log(`        Không tìm thấy subsubfolders trong subfolder hoặc không phải array`);
                }
              }
            } else {
              console.log(`    Không tìm thấy subfolders trong lesson hoặc không phải array`);
            }
          }
        } else {
          console.log(`  Không tìm thấy lessons trong chapter hoặc không phải array`);
        }
      }
    } else {
      console.log(`Không tìm thấy chapters trong nội dung khóa học hoặc không phải array`);
    }
    
    // Kiểm tra thêm trường sections (cấu trúc cũ có thể sử dụng)
    if (courseContent.sections && Array.isArray(courseContent.sections)) {
      console.log(`Kiểm tra bổ sung: Tìm thấy cấu trúc sections (${courseContent.sections.length} mục)`);
      for (const section of courseContent.sections) {
        console.log(`Xử lý section: ${section.name || section.title || section.id}`);
        // Xử lý tương tự như chapters
        if (section.lectures && Array.isArray(section.lectures)) {
          for (const lecture of section.lectures) {
            console.log(`  Xử lý lecture: ${lecture.name || lecture.title || lecture.id}`);
            
            // Kiểm tra files trong lecture
            if (lecture.files && Array.isArray(lecture.files)) {
              console.log(`    Tìm thấy ${lecture.files.length} file trong lecture`);
              for (const file of lecture.files) {
                if (file.storage && file.storage.provider === 'wasabi' && file.storage.key) {
                  console.log(`    Kiểm tra file: ${file.name}, id: ${file.id}, đã xử lý: ${processedFiles.has(file.id)}`);
                  
                  if (!processedFiles.has(file.id)) {
                    console.log(`    Thêm file để xóa: ${file.name}, key: ${file.storage.key}`);
                    keysToDelete.push(file.storage.key);
                    filesToDeleteFromDB.push({
                      type: 'lectureFile',
                      sectionId: section.id,
                      lectureId: lecture.id,
                      fileId: file.id
                    });
                  }
                } else {
                  console.log(`    File không có storage hoặc không phải Wasabi: ${file.name}`);
                }
              }
            }
          }
        }
      }
    }
    
    console.log(`Tìm thấy ${keysToDelete.length} file cần xóa từ Wasabi`);
    
    if (keysToDelete.length === 0) {
      console.log("Không có file cần xóa");
      
      // Kiểm tra toàn bộ dữ liệu để tìm khóa Wasabi
      let allStorageKeys = [];
      const scanForStorageKeys = (obj) => {
        if (!obj) return;
        
        if (typeof obj === 'object') {
          if (obj.storage && obj.storage.provider === 'wasabi' && obj.storage.key) {
            console.log(`Tìm thấy key trực tiếp: ${obj.storage.key}`);
            allStorageKeys.push(obj.storage.key);
          }
          
          // Kiểm tra nếu là subsubfolders
          if (obj.subfolders && Array.isArray(obj.subfolders)) {
            console.log(`Quét đệ quy: Tìm thấy ${obj.subfolders.length} subsubfolders`);
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
      console.log(`Quét đệ quy toàn bộ cấu trúc dữ liệu: Tìm thấy ${allStorageKeys.length} key`);
      
      if (allStorageKeys.length > 0) {
        keysToDelete.push(...allStorageKeys);
        console.log(`Đã thêm ${allStorageKeys.length} key vào danh sách xóa từ quét đệ quy`);
      } else {
        return { changed: false };
      }
    }
    
    // Xóa files từ Wasabi
    let successCount = 0;
    let failedCount = 0;
    
    console.log(`Bắt đầu xóa ${keysToDelete.length} file từ Wasabi`);
    
    for (const key of keysToDelete) {
      try {
        console.log(`Đang xóa file: ${key}`);
        const response = await fetch(`/api/storage/delete?key=${encodeURIComponent(key)}`, {
          method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
          console.log(`Đã xóa file: ${key}`);
          successCount++;
        } else {
          console.error(`Lỗi khi xóa file ${key}: ${result.error || 'Unknown error'}`);
          failedCount++;
        }
      } catch (error) {
        console.error(`Lỗi khi xóa file ${key}: ${error.message}`);
        failedCount++;
      }
    }
    
    // Cập nhật MongoDB - xóa các file đã xóa khỏi cấu trúc dữ liệu
    if (filesToDeleteFromDB.length > 0) {
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
            lesson.files.splice(fileIndex, 1);
            console.log(`Đã xóa file ID ${fileToDelete.fileId} khỏi lesson ${lesson.title || lesson.id}`);
          }
        } else if (fileToDelete.type === 'subfolderFile') {
          const subfolderIndex = lesson.subfolders.findIndex(s => s.id === fileToDelete.subfolderId);
          if (subfolderIndex !== -1) {
            const subfolder = lesson.subfolders[subfolderIndex];
            const fileIndex = subfolder.files.findIndex(f => f.id === fileToDelete.fileId);
            if (fileIndex !== -1) {
              subfolder.files.splice(fileIndex, 1);
              console.log(`Đã xóa file ID ${fileToDelete.fileId} khỏi subfolder ${subfolder.name}`);
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
                subsubfolder.files.splice(fileIndex, 1);
                console.log(`Đã xóa file ID ${fileToDelete.fileId} khỏi subsubfolder ${subsubfolder.name}`);
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
      
      console.log(`Đã cập nhật database sau khi xóa ${successCount} file`);
    }
    
    // Xóa thư mục trống nếu cần
    try {
      if (successCount > 0) {
        console.log(`Đang thử xóa thư mục trống trên Wasabi cho khóa học ${courseId}`);
        
        // Các đường dẫn thư mục có thể có
        const folderPaths = [
          `courses/${courseId}/`,
          `course/${courseId}/`
        ];
        
        let deletedFolders = 0;
        
        // Gọi API để xóa các thư mục
        for (const folderPath of folderPaths) {
          try {
            console.log(`Thử xóa thư mục: ${folderPath}`);
            
            const response = await fetch(`/api/storage/delete?key=${encodeURIComponent(folderPath)}`, {
              method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
              console.log(`Đã xóa thư mục ${folderPath}`);
              deletedFolders++;
            } else {
              console.log(`Thư mục ${folderPath} không tồn tại hoặc không thể xóa`);
            }
          } catch (error) {
            console.log(`Không thể xóa thư mục ${folderPath}: ${error.message}`);
          }
        }
        
        console.log(`Đã xóa ${deletedFolders} thư mục trống`);
      }
    } catch (error) {
      console.error(`Lỗi khi xóa thư mục: ${error.message}`);
    }
    
    console.log(`==================== KẾT THÚC ĐỒNG BỘ HÓA ====================`);
    return {
      changed: true,
      deletedFilesCount: successCount,
      failedDeletionsCount: failedCount
    };
  } catch (error) {
    console.error(`Lỗi khi đồng bộ hóa các mục đã xóa: ${error.message}`);
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