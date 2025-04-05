/**
 * Script di chuyển dữ liệu shares từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-shares.js
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
 * Chuyển đổi dữ liệu share từ cấu trúc Firebase sang MongoDB
 * @param {Object} firebaseShare - Dữ liệu share từ Firebase
 * @param {string} shareId - ID của share
 * @returns {Object} - Dữ liệu share đã chuyển đổi cho MongoDB
 */
function transformShareData(firebaseShare, shareId) {
  // Chuyển đổi dữ liệu, giữ nguyên ID
  const mongoShare = {
    _id: shareId, // Sử dụng ID từ Firebase làm _id trong MongoDB
    ...firebaseShare,
    // Chuyển đổi timestamps
    createdAt: firebaseShare.createdAt ? new Date(firebaseShare.createdAt) : new Date(),
    updatedAt: firebaseShare.updatedAt ? new Date(firebaseShare.updatedAt) : new Date(),
    // Chuyển đổi các trường ngày tháng khác nếu có
    expiredAt: firebaseShare.expiredAt ? new Date(firebaseShare.expiredAt) : null,
  };

  // Chuyển đổi ID các tài nguyên liên quan sang dạng string
  if (mongoShare.courseId) {
    mongoShare.courseId = mongoShare.courseId.toString();
  }

  if (mongoShare.userId) {
    mongoShare.userId = mongoShare.userId.toString();
  }

  if (mongoShare.sectionId) {
    mongoShare.sectionId = mongoShare.sectionId.toString();
  }

  if (mongoShare.lessonId) {
    mongoShare.lessonId = mongoShare.lessonId.toString();
  }

  // Xử lý các trường dữ liệu khác nếu cần

  return mongoShare;
}

/**
 * Di chuyển shares từ Firebase sang MongoDB
 */
async function migrateShares() {
  console.log('Bắt đầu di chuyển shares từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng shares
    const countSnapshot = await firestore.collection('shares').count().get();
    const totalShares = countSnapshot.data().count;
    console.log(`Tổng số shares: ${totalShares}`);
    
    // Di chuyển shares theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreShares = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreShares) {
      let query = firestore.collection('shares').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreShares = false;
        break;
      }
      
      // Xử lý từng share
      for (const doc of snapshot.docs) {
        try {
          const shareData = doc.data();
          const shareId = doc.id;
          
          console.log(`Đang di chuyển share: ${shareId}`);
          
          // Chuyển đổi dữ liệu và lưu vào MongoDB
          const transformedShare = transformShareData(shareData, shareId);
          await db.insertDocument("shares", transformedShare);
          
          successfulMigrations.push({
            id: shareId,
            type: shareData.type || 'unknown',
          });
          
          console.log(`Đã di chuyển share thành công: ${shareId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển share ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalShares} shares`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN SHARES =====');
    console.log(`Tổng số shares: ${totalShares}`);
    console.log(`Số shares đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số shares di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác shares di chuyển thất bại:');
      failedMigrations.forEach((share, index) => {
        console.log(`${index + 1}. ${share.id} - Lỗi: ${share.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-shares-report.json', JSON.stringify({
      total: totalShares,
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-shares-report.json');
    console.log('\nHoàn thành di chuyển shares');
  } catch (error) {
    console.error('Lỗi khi di chuyển shares:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu shares từ Firebase sang MongoDB');
    await migrateShares();
    console.log('Hoàn thành quá trình di chuyển shares');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 