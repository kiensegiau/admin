const { ObjectId } = require('mongodb');
const { 
  findOneDocument, 
  insertDocument, 
  updateDocument,
  deleteDocument 
} = require('@/lib/db');
const slugify = require('slugify');
const { v4: uuidv4 } = require('uuid');

/**
 * Lớp adapter để chuyển đổi giữa cấu trúc Firebase cũ và MongoDB mới
 * Đồng nhất giữa cấu trúc "chapter" ở API và "section" trong MongoDB
 */
class CourseAdapter {
  /**
   * Chuyển đổi từ cấu trúc cũ sang cấu trúc mới và lưu vào MongoDB
   * @param {Object} legacyCourse - Khóa học với cấu trúc cũ
   * @returns {Promise<string>} - MongoDB ID của khóa học mới
   */
  static async importFromLegacyStructure(legacyCourse) {
    try {
      // 1. Tạo document trong collection courses
      const courseData = {
        title: legacyCourse.title,
        slug: slugify(legacyCourse.title, { lower: true }),
        description: legacyCourse.description || "",
        shortDescription: legacyCourse.shortDescription || "",
        thumbnail: legacyCourse.thumbnail || "",
        price: legacyCourse.price || 0,
        discountPrice: legacyCourse.discountPrice || 0,
        status: legacyCourse.status || "draft",
        featured: legacyCourse.featured || false,
        driveFolderId: legacyCourse.driveFolderId,
        driveUrl: legacyCourse.driveUrl,
        authorId: legacyCourse.teacherId ? new ObjectId(legacyCourse.teacherId) : new ObjectId(),
        createdAt: legacyCourse.createdAt ? new Date(legacyCourse.createdAt) : new Date(),
        updatedAt: new Date(),
      };
      
      const result = await insertDocument("courses", courseData);
      const courseId = result.insertedId;
      
      // 2. Chuyển đổi chapters thành sections
      const sections = Array.isArray(legacyCourse.chapters) ? legacyCourse.chapters.map((chapter, index) => {
        return {
          title: chapter.title,
          order: index + 1,
          lessons: Array.isArray(chapter.lessons) ? chapter.lessons.map((lesson, lessonIndex) => {
            return {
              title: lesson.title,
              description: lesson.description || "",
              type: this._determineLessonType(lesson),
              content: this._determineLessonContent(lesson),
              duration: this._calculateDuration(lesson),
              order: lessonIndex + 1,
              isPreview: lesson.isPreview || false,
              metadata: this._extractMetadata(lesson),
            };
          }) : [],
        };
      }) : [];
      
      // 3. Tạo document trong collection courseContents
      const totalLessons = this._countTotalLessons(sections);
      const totalDuration = this._calculateTotalDuration(sections);
      
      await insertDocument("courseContents", {
        courseId,
        sections,
        totalLessons,
        totalDuration,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      
      return courseId.toString();
    } catch (error) {
      console.error("Error importing course from legacy structure:", error);
      throw error;
    }
  }
  
  /**
   * Lấy dữ liệu theo cấu trúc cũ từ MongoDB
   * @param {string} courseId - ID của khóa học
   * @returns {Promise<Object|null>} - Khóa học với cấu trúc cũ
   */
  static async toLegacyStructure(courseId) {
    try {
      // Lấy dữ liệu từ MongoDB theo cấu trúc mới
      const course = await findOneDocument("courses", { 
        _id: new ObjectId(courseId) 
      });
      
      if (!course) return null;
      
      const courseContent = await findOneDocument("courseContents", {
        courseId: new ObjectId(courseId)
      });
      
      if (!courseContent) {
        // Trả về dữ liệu cơ bản nếu không có nội dung khóa học
        return {
          id: course._id.toString(),
          title: course.title,
          description: course.description,
          price: course.price,
          status: course.status,
          driveUrl: course.driveUrl,
          driveFolderId: course.driveFolderId,
          chapters: [],
          totalChapters: 0,
          totalLessons: 0,
          createdAt: course.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: course.updatedAt?.toISOString() || new Date().toISOString(),
        };
      }
      
      // Chuyển đổi sang cấu trúc cũ
      const legacyCourse = {
        id: course._id.toString(),
        title: course.title,
        description: course.description,
        shortDescription: course.shortDescription,
        thumbnail: course.thumbnail,
        price: course.price,
        discountPrice: course.discountPrice,
        status: course.status,
        featured: course.featured,
        driveUrl: course.driveUrl,
        driveFolderId: course.driveFolderId,
        chapters: courseContent.sections.map((section, index) => {
          return {
            id: index.toString(),
            title: section.title,
            lessons: section.lessons.map((lesson, lessonIndex) => {
              return {
                id: lessonIndex.toString(),
                title: lesson.title,
                description: lesson.description,
                files: this._convertLessonToFiles(lesson),
                subfolders: this._extractSubfoldersFromLesson(lesson),
                type: lesson.type,
                isPreview: lesson.isPreview,
                order: lesson.order,
                updatedAt: lesson.updatedAt?.toISOString() || new Date().toISOString(),
              };
            }),
            totalLessons: section.lessons.length,
            order: section.order,
            updatedAt: section.updatedAt?.toISOString() || new Date().toISOString(),
          };
        }),
        totalChapters: courseContent.sections.length,
        totalLessons: courseContent.totalLessons,
        createdAt: course.createdAt?.toISOString() || new Date().toISOString(),
        updatedAt: course.updatedAt?.toISOString() || new Date().toISOString(),
      };
      
      return legacyCourse;
    } catch (error) {
      console.error("Error converting to legacy structure:", error);
      throw error;
    }
  }
  
  /**
   * Tạo hoặc cập nhật chapter trong cấu trúc mới
   * @param {string} courseId - ID của khóa học
   * @param {string} chapterName - Tên của chapter
   * @returns {Promise<Object>} - Thông tin về chapter
   */
  static async getOrCreateChapter(courseId, chapterName) {
    try {
      // Tìm nội dung khóa học trong MongoDB
      const courseContent = await findOneDocument("courseContents", {
        courseId: new ObjectId(courseId),
      });

      if (!courseContent) {
        throw new Error(`Không tìm thấy nội dung khóa học với ID: ${courseId}`);
      }

      // Tìm chapter theo tên trong mảng sections
      const chapterIndex = courseContent.sections.findIndex(
        (section) => section.title.toLowerCase() === chapterName.toLowerCase()
      );

      if (chapterIndex !== -1) {
        // Chapter đã tồn tại
        return {
          id: chapterIndex.toString(), // Sử dụng index làm ID
          name: courseContent.sections[chapterIndex].title,
        };
      }

      // Chapter chưa tồn tại, tạo mới
      const newChapter = {
        title: chapterName,
        order: courseContent.sections.length + 1,
        lessons: [],
        updatedAt: new Date(),
      };

      // Thêm chapter vào mảng sections
      await updateDocument(
        "courseContents",
        { courseId: new ObjectId(courseId) },
        {
          $push: { sections: newChapter },
          $set: { updatedAt: new Date() },
        }
      );

      // Lấy lại courseContent sau khi cập nhật
      const updatedCourseContent = await findOneDocument("courseContents", {
        courseId: new ObjectId(courseId),
      });

      return {
        id: (updatedCourseContent.sections.length - 1).toString(), // Index của chapter mới
        name: chapterName,
      };
    } catch (error) {
      console.error("Error in getOrCreateChapter:", error);
      throw error;
    }
  }
  
  /**
   * Tạo hoặc cập nhật lesson trong cấu trúc mới
   * @param {string} courseId - ID của khóa học
   * @param {string} chapterId - ID (index) của chapter
   * @param {string} lessonName - Tên của lesson
   * @returns {Promise<Object>} - Thông tin về lesson
   */
  static async getOrCreateLesson(courseId, chapterId, lessonName) {
    try {
      const chapterIndex = parseInt(chapterId);
      
      // Tìm nội dung khóa học từ MongoDB
      const courseContent = await findOneDocument("courseContents", {
        courseId: new ObjectId(courseId),
      });

      if (!courseContent || !courseContent.sections[chapterIndex]) {
        throw new Error(`Không tìm thấy chapter với index ${chapterIndex}`);
      }

      const chapter = courseContent.sections[chapterIndex];
      
      // Tìm lesson theo tên
      const lessonIndex = chapter.lessons.findIndex(
        (lesson) => lesson.title.toLowerCase() === lessonName.toLowerCase()
      );

      if (lessonIndex !== -1) {
        // Lesson đã tồn tại
        return {
          id: lessonIndex.toString(), // Sử dụng index làm ID
          name: chapter.lessons[lessonIndex].title,
        };
      }

      // Lesson chưa tồn tại, tạo mới
      const newLesson = {
        title: lessonName,
        description: "",
        type: "text", // Mặc định là text, sẽ cập nhật sau khi thêm file
        content: "",
        duration: 0,
        order: chapter.lessons.length + 1,
        isPreview: false,
        updatedAt: new Date(),
      };

      // Thêm lesson vào mảng lessons của chapter
      await updateDocument(
        "courseContents",
        { courseId: new ObjectId(courseId) },
        {
          $push: { [`sections.${chapterIndex}.lessons`]: newLesson },
          $set: { updatedAt: new Date() },
        }
      );

      // Cập nhật tổng số lessons trong khóa học
      await this._updateCourseTotals(courseId);

      // Lấy lại courseContent sau khi cập nhật
      const updatedCourseContent = await findOneDocument("courseContents", {
        courseId: new ObjectId(courseId),
      });

      return {
        id: (updatedCourseContent.sections[chapterIndex].lessons.length - 1).toString(),
        name: lessonName,
      };
    } catch (error) {
      console.error("Error in getOrCreateLesson:", error);
      throw error;
    }
  }
  
  /**
   * Thêm file vào lesson trong cấu trúc mới
   * @param {string} courseId - ID của khóa học
   * @param {string} chapterId - ID (index) của chapter
   * @param {string} lessonId - ID (index) của lesson
   * @param {Object} file - Thông tin file cần thêm
   * @param {string} subfolderId - ID của subfolder (nếu có)
   * @returns {Promise<boolean>} - Kết quả thêm file
   */
  static async addFileToLesson(courseId, chapterId, lessonId, file, subfolderId = null) {
    try {
      const chapterIndex = parseInt(chapterId);
      const lessonIndex = parseInt(lessonId);

      // Lấy nội dung khóa học từ MongoDB
      const courseContent = await findOneDocument("courseContents", {
        courseId: new ObjectId(courseId),
      });

      if (!courseContent || !courseContent.sections[chapterIndex]) {
        throw new Error(`Không tìm thấy chapter với index ${chapterIndex}`);
      }

      const chapter = courseContent.sections[chapterIndex];

      if (!chapter.lessons[lessonIndex]) {
        throw new Error(`Không tìm thấy lesson với index ${lessonIndex}`);
      }

      // Xác định loại file
      const fileType = this._getFileType(file.mimeType);
      
      // Chuẩn bị thông tin cập nhật
      let updateData = {
        [`sections.${chapterIndex}.lessons.${lessonIndex}.type`]: fileType,
        [`sections.${chapterIndex}.lessons.${lessonIndex}.content`]: file.wasabiUrl || file.url,
        [`sections.${chapterIndex}.lessons.${lessonIndex}.updatedAt`]: new Date(),
        updatedAt: new Date(),
      };

      // Nếu là video, cập nhật thời lượng
      if (fileType === "video" && file.duration) {
        updateData[`sections.${chapterIndex}.lessons.${lessonIndex}.duration`] = file.duration;
      }

      // Xử lý metadata và subfolders
      if (subfolderId) {
        // Thêm vào subfolder
        const metadataPath = `sections.${chapterIndex}.lessons.${lessonIndex}.subfolders`;
        
        // Kiểm tra nếu subfolders đã tồn tại
        const lesson = chapter.lessons[lessonIndex];
        if (!lesson.subfolders) {
          // Tạo mảng subfolders nếu chưa có
          updateData[metadataPath] = [{
            id: subfolderId,
            name: file.subfolder || "Other Files",
            files: [{
              id: uuidv4(),
              name: file.name,
              originalName: file.originalName || file.name,
              mimeType: file.mimeType,
              size: file.size || 0,
              wasabiKey: file.wasabiKey,
              wasabiUrl: file.wasabiUrl,
              driveFileId: file.id || null,
              uploadTime: new Date(),
            }]
          }];
        } else {
          // Khó xử lý trực tiếp với MongoDB operators, nên lấy về, sửa và cập nhật lại
          const subfolders = lesson.subfolders || [];
          const subfolderIndex = subfolders.findIndex(sf => sf.id === subfolderId);
          
          if (subfolderIndex === -1) {
            subfolders.push({
              id: subfolderId,
              name: file.subfolder || "Other Files",
              files: [{
                id: uuidv4(),
                name: file.name,
                originalName: file.originalName || file.name,
                mimeType: file.mimeType,
                size: file.size || 0,
                wasabiKey: file.wasabiKey,
                wasabiUrl: file.wasabiUrl,
                driveFileId: file.id || null,
                uploadTime: new Date(),
              }]
            });
          } else {
            subfolders[subfolderIndex].files.push({
              id: uuidv4(),
              name: file.name,
              originalName: file.originalName || file.name,
              mimeType: file.mimeType,
              size: file.size || 0,
              wasabiKey: file.wasabiKey,
              wasabiUrl: file.wasabiUrl,
              driveFileId: file.id || null,
              uploadTime: new Date(),
            });
          }
          
          updateData[metadataPath] = subfolders;
        }
      } else {
        // Thêm metadata bình thường
        updateData[`sections.${chapterIndex}.lessons.${lessonIndex}.metadata`] = {
          originalName: file.originalName || file.name,
          mimeType: file.mimeType,
          size: file.size || 0,
          wasabiKey: file.wasabiKey,
          driveFileId: file.id || null,
        };
      }

      // Cập nhật lesson trong MongoDB
      await updateDocument(
        "courseContents",
        { courseId: new ObjectId(courseId) },
        { $set: updateData }
      );

      // Cập nhật tổng thời lượng khóa học
      await this._updateCourseTotals(courseId);

      return true;
    } catch (error) {
      console.error("Error in addFileToLesson:", error);
      throw error;
    }
  }
  
  // ==================== PRIVATE METHODS ====================
  
  /**
   * Xác định loại bài học dựa trên dữ liệu
   * @private
   */
  static _determineLessonType(lesson) {
    if (!lesson.files || lesson.files.length === 0) {
      return "text";
    }
    
    // Ưu tiên video
    const videoFile = lesson.files.find(file => 
      file.mimeType && file.mimeType.startsWith('video/')
    );
    
    if (videoFile) return "video";
    
    // Tiếp theo là audio
    const audioFile = lesson.files.find(file => 
      file.mimeType && file.mimeType.startsWith('audio/')
    );
    
    if (audioFile) return "audio";
    
    // Tiếp theo là pdf
    const pdfFile = lesson.files.find(file => 
      file.mimeType === 'application/pdf'
    );
    
    if (pdfFile) return "pdf";
    
    // Mặc định là text
    return "text";
  }
  
  /**
   * Xác định nội dung bài học dựa trên dữ liệu
   * @private
   */
  static _determineLessonContent(lesson) {
    if (!lesson.files || lesson.files.length === 0) {
      return "";
    }
    
    // Dựa vào loại bài học để lấy URL phù hợp
    const type = this._determineLessonType(lesson);
    
    if (type === "video") {
      const videoFile = lesson.files.find(file => 
        file.mimeType && file.mimeType.startsWith('video/')
      );
      return videoFile.storage?.key || videoFile.proxyUrl || "";
    }
    
    if (type === "audio") {
      const audioFile = lesson.files.find(file => 
        file.mimeType && file.mimeType.startsWith('audio/')
      );
      return audioFile.storage?.key || audioFile.proxyUrl || "";
    }
    
    if (type === "pdf") {
      const pdfFile = lesson.files.find(file => 
        file.mimeType === 'application/pdf'
      );
      return pdfFile.storage?.key || pdfFile.proxyUrl || "";
    }
    
    return "";
  }
  
  /**
   * Tính toán thời lượng bài học
   * @private
   */
  static _calculateDuration(lesson) {
    // Thời lượng chỉ áp dụng cho video/audio
    // Chưa có thông tin thời lượng trong cấu trúc cũ
    return 0;
  }
  
  /**
   * Trích xuất metadata từ bài học
   * @private
   */
  static _extractMetadata(lesson) {
    const metadata = {};
    
    if (lesson.files && lesson.files.length > 0) {
      const mainFile = lesson.files[0];
      metadata.originalName = mainFile.name;
      metadata.mimeType = mainFile.mimeType;
      metadata.size = mainFile.size;
      metadata.driveFileId = mainFile.driveFileId;
      
      if (mainFile.storage) {
        metadata.wasabiKey = mainFile.storage.key;
      }
    }
    
    return metadata;
  }
  
  /**
   * Đếm tổng số bài học
   * @private
   */
  static _countTotalLessons(sections) {
    return sections.reduce((total, section) => {
      return total + section.lessons.length;
    }, 0);
  }
  
  /**
   * Tính toán tổng thời lượng khóa học
   * @private
   */
  static _calculateTotalDuration(sections) {
    return sections.reduce((total, section) => {
      return total + section.lessons.reduce((lessonTotal, lesson) => {
        return lessonTotal + (lesson.duration || 0);
      }, 0);
    }, 0);
  }
  
  /**
   * Chuyển đổi lesson thành mảng files (cấu trúc cũ)
   * @private
   */
  static _convertLessonToFiles(lesson) {
    // Nếu là cấu trúc cũ (có sẵn files)
    if (Array.isArray(lesson.files)) {
      return lesson.files;
    }
    
    // Nếu là cấu trúc mới (không có files)
    if (lesson.metadata && lesson.content) {
      const file = {
        id: uuidv4(),
        name: lesson.metadata.originalName || "Untitled",
        mimeType: lesson.metadata.mimeType || "application/octet-stream",
        type: lesson.type || "unknown",
        size: lesson.metadata.size || "0",
        driveFileId: lesson.metadata.driveFileId || null,
        storage: null,
      };
      
      if (lesson.metadata.wasabiKey) {
        file.storage = {
          provider: "wasabi",
          key: lesson.metadata.wasabiKey,
          size: lesson.metadata.size || 0,
          uploadTime: new Date().toISOString(),
        };
      } else if (lesson.content) {
        // Nếu có content nhưng không có wasabiKey, giả định là URL
        file.proxyUrl = lesson.content;
      }
      
      return [file];
    }
    
    return [];
  }
  
  /**
   * Trích xuất subfolders từ lesson
   * @private
   */
  static _extractSubfoldersFromLesson(lesson) {
    if (Array.isArray(lesson.subfolders)) {
      return lesson.subfolders;
    }
    
    return [];
  }
  
  /**
   * Cập nhật thông tin tổng quan của khóa học
   * @private
   */
  static async _updateCourseTotals(courseId) {
    try {
      const courseContent = await findOneDocument("courseContents", {
        courseId: new ObjectId(courseId),
      });

      if (!courseContent) {
        throw new Error(`Không tìm thấy nội dung khóa học với ID: ${courseId}`);
      }

      let totalLessons = 0;
      let totalDuration = 0;

      courseContent.sections.forEach((section) => {
        totalLessons += section.lessons.length;
        section.lessons.forEach((lesson) => {
          totalDuration += lesson.duration || 0;
        });
      });

      await updateDocument(
        "courseContents",
        { courseId: new ObjectId(courseId) },
        {
          $set: {
            totalLessons,
            totalDuration,
            updatedAt: new Date(),
          },
        }
      );
      
      // Cập nhật cả bảng courses
      await updateDocument(
        "courses",
        { _id: new ObjectId(courseId) },
        {
          $set: {
            totalLessons,
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      console.error("Error updating course totals:", error);
      throw error;
    }
  }
  
  /**
   * Xác định loại file dựa vào mimeType
   * @private
   */
  static _getFileType(mimeType) {
    if (!mimeType) return "unknown";
    
    if (mimeType.startsWith("video/")) {
      return "video";
    }
    
    if (mimeType.startsWith("audio/")) {
      return "audio";
    }
    
    if (mimeType === "application/pdf") {
      return "pdf";
    }
    
    if (mimeType.startsWith("image/")) {
      return "image";
    }
    
    if (mimeType.includes("document") || 
        mimeType.includes("sheet") || 
        mimeType.includes("presentation")) {
      return "document";
    }
    
    return "file";
  }
}

module.exports = { CourseAdapter }; 