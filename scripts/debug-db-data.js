/**
 * Script để log dữ liệu từ MongoDB để debug
 * Chạy script: node scripts/debug-db-data.js
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const db = require('./cjs-db');

// Tải biến môi trường
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Kết nối MongoDB
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI không được định nghĩa trong biến môi trường');
  process.exit(1);
}

/**
 * Log thông tin cấu trúc của collection
 * @param {string} collectionName - Tên collection
 * @param {Array} documents - Documents trong collection
 */
function logCollectionInfo(collectionName, documents) {
  console.log(`\n===== COLLECTION: ${collectionName.toUpperCase()} =====`);
  console.log(`Số lượng documents: ${documents.length}`);
  
  if (documents.length > 0) {
    // Log cấu trúc của document đầu tiên
    console.log(`\nCấu trúc document:`);
    const structure = {};
    Object.keys(documents[0]).forEach(key => {
      const value = documents[0][key];
      if (value === null) {
        structure[key] = 'null';
      } else if (Array.isArray(value)) {
        structure[key] = `Array(${value.length})`;
        if (value.length > 0) {
          if (typeof value[0] === 'object' && value[0] !== null) {
            structure[key] += ` - Keys: [${Object.keys(value[0]).join(', ')}]`;
          } else {
            structure[key] += ` - Type: ${typeof value[0]}`;
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        if (value instanceof Date) {
          structure[key] = 'Date';
        } else {
          structure[key] = `Object - Keys: [${Object.keys(value).join(', ')}]`;
        }
      } else {
        structure[key] = typeof value;
      }
    });
    console.log(JSON.stringify(structure, null, 2));
    
    // Nếu là collection courses, log thêm thông tin
    if (collectionName === 'courses') {
      console.log('\nDanh sách khóa học:');
      documents.forEach((course, index) => {
        console.log(`${index + 1}. ${course.title} (ID: ${course._id})`);
        console.log(`   - Slug: ${course.slug}`);
        console.log(`   - Published: ${course.published}`);
        console.log(`   - Số chapters: ${course.chapters ? course.chapters.length : 0}`);
        if (course.chapters && course.chapters.length > 0) {
          let totalLessons = 0;
          course.chapters.forEach(chapter => {
            if (chapter.lessons) {
              totalLessons += chapter.lessons.length;
            }
          });
          console.log(`   - Tổng số lessons: ${totalLessons}`);
        }
      });
    }
  }
}

/**
 * Lưu dữ liệu vào file JSON để xem chi tiết
 * @param {string} collectionName - Tên collection
 * @param {Array} documents - Documents trong collection
 */
function saveDataToFile(collectionName, documents) {
  const fileName = `debug-${collectionName}.json`;
  fs.writeFileSync(fileName, JSON.stringify(documents, null, 2));
  console.log(`\nĐã lưu dữ liệu chi tiết vào file ${fileName}`);
}

/**
 * Hiển thị dữ liệu từ một collection
 * @param {string} collectionName - Tên collection cần kiểm tra
 */
async function debugCollection(collectionName) {
  try {
    const documents = await db.findDocuments(collectionName);
    logCollectionInfo(collectionName, documents);
    saveDataToFile(collectionName, documents);
  } catch (error) {
    console.error(`Lỗi khi truy xuất collection ${collectionName}:`, error);
  }
}

/**
 * Debug API endpoint
 */
async function debugApi() {
  console.log('\n===== KIỂM TRA CÁC API ENDPOINT =====');
  
  // Kiểm tra cấu trúc thư mục API
  const apiDirPath = path.resolve(process.cwd(), 'pages/api');
  if (fs.existsSync(apiDirPath)) {
    const apiFiles = fs.readdirSync(apiDirPath, { recursive: true });
    
    console.log('\nCác API endpoint đã định nghĩa:');
    apiFiles.forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        console.log(`/api/${file.replace(/\\/g, '/').replace(/\.(js|ts)$/, '')}`);
      }
    });
    
    // Kiểm tra chi tiết API courses
    const coursesApiPath = path.resolve(apiDirPath, 'courses.js');
    if (fs.existsSync(coursesApiPath)) {
      console.log('\nNội dung API courses:');
      const content = fs.readFileSync(coursesApiPath, 'utf8');
      console.log(content);
    } else {
      console.log('\nKhông tìm thấy file API courses.js');
    }
  } else {
    console.log('Không tìm thấy thư mục pages/api');
  }
}

/**
 * Hàm chính để debug dữ liệu
 */
async function debugDatabase() {
  try {
    console.log('Bắt đầu debug dữ liệu từ MongoDB...');
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Check courses collection (quan trọng nhất)
    await debugCollection('courses');
    
    // Check các collection khác
    await debugCollection('users');
    await debugCollection('enrollments');
    await debugCollection('transactions');
    
    // Debug API endpoint
    await debugApi();
    
    console.log('\nHoàn thành quá trình debug dữ liệu');
  } catch (error) {
    console.error('Lỗi trong quá trình debug:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy debug
debugDatabase(); 