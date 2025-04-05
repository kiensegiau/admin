/**
 * Script di chuyển dữ liệu khóa học từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-courses.js
 */

const admin = require('firebase-admin');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const slugify = require('slugify');
const { v4: uuidv4 } = require('uuid');
const db = require('./cjs-db');

// Tải biến môi trường
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Khởi tạo Firebase Admin
const serviceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const firestore = admin.firestore();

// Kết nối MongoDB
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI không được định nghĩa trong biến môi trường');
  process.exit(1);
}

// Kích thước batch cho mỗi lần xử lý
const BATCH_SIZE = 10;

/**
 * Class CourseAdapter trực tiếp trong file script
 * để tránh lỗi import từ lib
 */
class CourseAdapter {
  /**
   * Chuyển đổi từ cấu trúc cũ sang cấu trúc mới và lưu vào MongoDB
   * @param {Object} legacyCourse - Khóa học với cấu trúc cũ
   * @returns {Promise<string>} - MongoDB ID của khóa học mới
   */
  static async importFromLegacyStructure(legacyCourse) {
    try {
      console.log(`Đang xử lý: ${legacyCourse.title}`);
      
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
        teacherId: legacyCourse.teacherId,
        createdAt: legacyCourse.createdAt ? new Date(legacyCourse.createdAt) : new Date(),
        updatedAt: new Date(),
      };
      
      const result = await db.insertDocument("courses", courseData);
      const courseId = result.insertedId;
      
      // 2. Chuyển đổi chapters thành sections
      const sections = Array.isArray(legacyCourse.chapters) ? legacyCourse.chapters.map((chapter, index) => {
        console.log(`  - Xử lý chapter: ${chapter.title}`);
        return {
          title: chapter.title,
          order: index + 1,
          lessons: Array.isArray(chapter.lessons) ? chapter.lessons.map((lesson, lessonIndex) => {
            console.log(`    + Xử lý lesson: ${lesson.title}`);
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
      
      await db.insertDocument("courseContents", {
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
  
  // --- Private methods ---
  
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
}

/**
 * Di chuyển khóa học từ Firebase sang MongoDB
 */
async function migrateCourses() {
  console.log('Bắt đầu di chuyển khóa học từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng khóa học
    const countSnapshot = await firestore.collection('courses').count().get();
    const totalCourses = countSnapshot.data().count;
    console.log(`Tổng số khóa học: ${totalCourses}`);
    
    // Di chuyển khóa học theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreCourses = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreCourses) {
      let query = firestore.collection('courses').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreCourses = false;
        break;
      }
      
      // Xử lý từng khóa học
      for (const doc of snapshot.docs) {
        try {
          const courseData = doc.data();
          courseData.id = doc.id;
          
          console.log(`Đang di chuyển khóa học: ${courseData.title} (${doc.id})`);
          
          // Chuyển đổi sang cấu trúc mới và lưu vào MongoDB
          const courseId = await CourseAdapter.importFromLegacyStructure(courseData);
          
          successfulMigrations.push({
            id: doc.id,
            title: courseData.title,
            mongoId: courseId
          });
          
          console.log(`Đã di chuyển khóa học thành công. MongoDB ID: ${courseId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển khóa học ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            title: doc.data().title,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalCourses} khóa học`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN KHÓA HỌC =====');
    console.log(`Tổng số khóa học: ${totalCourses}`);
    console.log(`Số khóa học đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số khóa học di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác khóa học di chuyển thất bại:');
      failedMigrations.forEach((course, index) => {
        console.log(`${index + 1}. ${course.title} (${course.id}) - Lỗi: ${course.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-report.json', JSON.stringify({
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-report.json');
    console.log('\nHoàn thành di chuyển khóa học');
  } catch (error) {
    console.error('Lỗi khi di chuyển khóa học:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu từ Firebase sang MongoDB');
    await migrateCourses();
    console.log('Hoàn thành quá trình di chuyển');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 