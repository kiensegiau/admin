/**
 * Script di chuyển dữ liệu enrollments từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-enrollments.js
 */

const admin = require('firebase-admin');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
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
const BATCH_SIZE = 100;

/**
 * Chuyển đổi dữ liệu enrollment từ cấu trúc Firebase sang MongoDB
 * @param {Object} firebaseEnrollment - Dữ liệu enrollment từ Firebase
 * @param {string} enrollmentId - ID của enrollment
 * @returns {Object} - Dữ liệu enrollment đã chuyển đổi cho MongoDB
 */
function transformEnrollmentData(firebaseEnrollment, enrollmentId) {
  // Chuyển đổi dữ liệu, giữ nguyên ID
  const mongoEnrollment = {
    _id: enrollmentId, // Sử dụng ID từ Firebase làm _id trong MongoDB
    ...firebaseEnrollment,
    // Chuyển đổi timestamps
    createdAt: firebaseEnrollment.createdAt ? new Date(firebaseEnrollment.createdAt) : new Date(),
    updatedAt: firebaseEnrollment.updatedAt ? new Date(firebaseEnrollment.updatedAt) : new Date(),
    enrolledAt: firebaseEnrollment.enrolledAt ? new Date(firebaseEnrollment.enrolledAt) : new Date(),
  };

  // Chuyển đổi ID sang ObjectId nếu cần
  if (mongoEnrollment.userId) {
    mongoEnrollment.userId = mongoEnrollment.userId.toString();
  }

  if (mongoEnrollment.courseId) {
    mongoEnrollment.courseId = mongoEnrollment.courseId.toString();
  }

  // Xử lý trường progress nếu có
  if (mongoEnrollment.progress && typeof mongoEnrollment.progress === 'object') {
    // Đảm bảo các trường last* là Date
    if (mongoEnrollment.progress.lastAccessedAt) {
      mongoEnrollment.progress.lastAccessedAt = new Date(mongoEnrollment.progress.lastAccessedAt);
    }
  }

  return mongoEnrollment;
}

/**
 * Di chuyển enrollments từ Firebase sang MongoDB
 */
async function migrateEnrollments() {
  console.log('Bắt đầu di chuyển enrollments từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng enrollments
    const countSnapshot = await firestore.collection('enrollments').count().get();
    const totalEnrollments = countSnapshot.data().count;
    console.log(`Tổng số enrollments: ${totalEnrollments}`);
    
    // Di chuyển enrollments theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreEnrollments = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreEnrollments) {
      let query = firestore.collection('enrollments').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreEnrollments = false;
        break;
      }
      
      // Xử lý từng enrollment
      for (const doc of snapshot.docs) {
        try {
          const enrollmentData = doc.data();
          const enrollmentId = doc.id;
          
          console.log(`Đang di chuyển enrollment: ${enrollmentId} (Khóa học: ${enrollmentData.courseId}, Người dùng: ${enrollmentData.userId})`);
          
          // Chuyển đổi dữ liệu và lưu vào MongoDB
          const transformedEnrollment = transformEnrollmentData(enrollmentData, enrollmentId);
          await db.insertDocument("enrollments", transformedEnrollment);
          
          successfulMigrations.push({
            id: enrollmentId,
            courseId: enrollmentData.courseId,
            userId: enrollmentData.userId
          });
          
          console.log(`Đã di chuyển enrollment thành công: ${enrollmentId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển enrollment ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            courseId: doc.data().courseId,
            userId: doc.data().userId,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalEnrollments} enrollments`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN ENROLLMENTS =====');
    console.log(`Tổng số enrollments: ${totalEnrollments}`);
    console.log(`Số enrollments đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số enrollments di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác enrollments di chuyển thất bại:');
      failedMigrations.forEach((enrollment, index) => {
        console.log(`${index + 1}. ID: ${enrollment.id}, Course: ${enrollment.courseId}, User: ${enrollment.userId} - Lỗi: ${enrollment.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-enrollments-report.json', JSON.stringify({
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-enrollments-report.json');
    console.log('\nHoàn thành di chuyển enrollments');
  } catch (error) {
    console.error('Lỗi khi di chuyển enrollments:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu enrollments từ Firebase sang MongoDB');
    await migrateEnrollments();
    console.log('Hoàn thành quá trình di chuyển enrollments');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 