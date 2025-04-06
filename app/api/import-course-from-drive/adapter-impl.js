/**
 * Triển khai import course từ Google Drive với adapter cho MongoDB
 */

import { CourseAdapter } from '@/lib/adapters/course-adapter';
import { getFileType } from './utils';
import { ObjectId } from 'mongodb';
import { findOneDocument, findDocuments, insertDocument, updateDocument } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { connectMongoDB } from '@/lib/mongodb';
import CourseContent from '@/models/courseContent';

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
 * Kiểm tra và xóa các file trùng lặp
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {string} fileName - Tên file cần kiểm tra
 * @param {string} subfolderId - ID của subfolder (nếu có)
 * @returns {Promise<Object>} - { needUpload, fileData }
 */
export async function checkAndDeleteDuplicateFiles(courseId, chapterId, lessonId, fileName, subfolderId = null) {
  try {
    if (!lessonId) {
      throw new Error("lessonId không thể null khi kiểm tra file trùng lặp");
    }

    // Tìm courseContent theo courseId
    const courseContent = await findOneDocument("courseContents", {
      courseId: new ObjectId(courseId)
    });

    if (!courseContent || !courseContent.chapters) {
      throw new Error(`Không tìm thấy dữ liệu khóa học với ID ${courseId}`);
    }

    // Tìm chapter
    const chapter = courseContent.chapters.find(ch => ch.id === chapterId);
    if (!chapter) {
      throw new Error(`Không tìm thấy chapter với ID ${chapterId}`);
    }

    // Tìm lesson
    const lesson = chapter.lessons.find(lesson => lesson.id === lessonId);
    if (!lesson) {
      throw new Error(`Không tìm thấy lesson với ID ${lessonId}`);
    }

    // Tìm file trong lesson hoặc subfolder
    let existingFile = null;
  
  if (subfolderId) {
      // Tìm trong subfolder
      const subfolder = lesson.subfolders?.find(sf => sf.id === subfolderId);
    if (subfolder) {
        existingFile = subfolder.files?.find(f => 
          f.name === fileName || f.originalName === fileName
        );
      }
    } else {
      // Tìm trong lesson
      existingFile = lesson.files?.find(f => 
        f.name === fileName || f.originalName === fileName
      );
    }

    // Nếu không tìm thấy file, hoặc tìm thấy nhưng không có storage
    if (!existingFile) {
      return { needUpload: true, fileData: null };
    }

    // Nếu file có storage.key, kiểm tra xem có cần tải lại không
    if (existingFile.storage && existingFile.storage.key) {
      // Nếu có key, tạm thời coi là không cần tải lại
      // Ở đây có thể thêm logic kiểm tra file có tồn tại thực sự trên Wasabi không
      // Ví dụ: call checkWasabiFile(existingFile.storage.key)
      console.log(`File ${fileName} đã tồn tại và có key Wasabi, không cần tải lại`);
      return { needUpload: false, fileData: existingFile };
    }

    // Nếu file không có storage.key, cần tải lại và cập nhật
    console.log(`File ${fileName} đã tồn tại nhưng không có key Wasabi, cần tải lại`);
    return { needUpload: true, fileData: existingFile };
  } catch (error) {
    console.error(`Lỗi khi kiểm tra file trùng lặp:`, error);
    // Trong trường hợp lỗi, cứ tải lại file để đảm bảo
    return { needUpload: true, fileData: null };
  }
}

/**
 * Thêm file vào lesson hoặc subfolder
 * @param {string} courseId - ID của khóa học
 * @param {string} chapterId - ID của chapter
 * @param {string} lessonId - ID của lesson
 * @param {Object} file - Thông tin file từ Google Drive
 * @param {string} subfolderId - ID của subfolder (nếu có)
 * @returns {Promise<boolean>} - Kết quả thêm file
 */
export async function addFileToLesson(courseId, chapterId, lessonId, file, subfolderId = null) {
  try {
    if (!lessonId) {
      throw new Error("lessonId không thể null khi thêm file");
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
    const lessonIndex = courseContent.chapters[chapterIndex].lessons.findIndex(
      lesson => lesson.id === lessonId
    );
    if (lessonIndex === -1) {
      throw new Error(`Không tìm thấy lesson với ID ${lessonId}`);
    }

    // Xác định loại file
    const fileType = getFileType(file.mimeType);
    const currentTime = new Date().toISOString();

    // Tạo đối tượng file mới (đồng nhất với cấu trúc db.json)
  const fileData = {
      id: file.id || uuidv4(),
      mimeType: file.mimeType || "application/octet-stream",
      name: file.name || "Untitled",
      originalName: file.name || "Untitled",
      type: fileType,
      uploadTime: currentTime,
      driveFileId: file.id || null,
      status: "active",
      size: file.size?.toString() || "0",
      modifiedTime: currentTime
    };

    // Thêm storage nếu có storage.key từ Wasabi
    if (file.storage && file.storage.key) {
      fileData.storage = {
        provider: "wasabi",
        key: file.storage.key,
        size: { "$numberInt": file.storage.size?.toString() || fileData.size },
        uploadTime: currentTime
      };
    } 
    // Thêm proxyUrl nếu không có storage.key (KHÔNG THỂ có cả hai)
    else if (file.proxyUrl) {
      fileData.proxyUrl = file.proxyUrl;
    }

    // Cập nhật database
    if (subfolderId) {
      // Tìm subfolder
      const lesson = courseContent.chapters[chapterIndex].lessons[lessonIndex];
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
            updatedAt: new Date().toISOString(),
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.subfolders.${subfolderIndex}.updatedAt`]: new Date().toISOString()
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
            updatedAt: new Date().toISOString(),
            [`chapters.${chapterIndex}.lessons.${lessonIndex}.updatedAt`]: new Date().toISOString()
          }
        }
      );

      console.log(`Đã thêm file ${file.name} vào lesson ID ${lessonId}`);
    }
  
  return true;
  } catch (error) {
    console.error(`Lỗi khi thêm file vào lesson:`, error);
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
    await connectMongoDB();
    
    // Lấy dữ liệu từ collection courseContents
    const courseContent = await CourseContent.findOne({ 
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
        }
      }
      
      // Cập nhật dữ liệu trong MongoDB
      await CourseContent.findOneAndUpdate(
        { courseId: new ObjectId(courseId) },
        { $set: { chapters: updatedChapters, updatedAt: new Date().toISOString() } },
        { new: true }
      );
      
      console.log(`Đã cập nhật database sau khi xóa ${successCount} file`);
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