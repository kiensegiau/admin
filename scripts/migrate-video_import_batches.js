/**
 * Script di chuyển dữ liệu video_import_batches từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-video_import_batches.js
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
const BATCH_SIZE = 50;

/**
 * Chuyển đổi dữ liệu video_import_batch từ cấu trúc Firebase sang MongoDB
 * @param {Object} firebaseBatch - Dữ liệu video_import_batch từ Firebase
 * @param {string} batchId - ID của video_import_batch
 * @returns {Object} - Dữ liệu video_import_batch đã chuyển đổi cho MongoDB
 */
function transformBatchData(firebaseBatch, batchId) {
  // Chuyển đổi dữ liệu, giữ nguyên ID
  const mongoBatch = {
    _id: batchId, // Sử dụng ID từ Firebase làm _id trong MongoDB
    ...firebaseBatch,
    // Chuyển đổi timestamps
    createdAt: firebaseBatch.createdAt ? new Date(firebaseBatch.createdAt) : new Date(),
    updatedAt: firebaseBatch.updatedAt ? new Date(firebaseBatch.updatedAt) : new Date(),
    startedAt: firebaseBatch.startedAt ? new Date(firebaseBatch.startedAt) : null,
    completedAt: firebaseBatch.completedAt ? new Date(firebaseBatch.completedAt) : null,
  };

  // Chuyển đổi các ID sang string nếu cần
  if (mongoBatch.userId) {
    mongoBatch.userId = mongoBatch.userId.toString();
  }

  if (mongoBatch.courseId) {
    mongoBatch.courseId = mongoBatch.courseId.toString();
  }

  // Xử lý mảng files nếu có
  if (Array.isArray(mongoBatch.files)) {
    mongoBatch.files = mongoBatch.files.map(file => {
      const transformedFile = {
        ...file,
        // Chuyển đổi timestamps của file nếu có
        uploadedAt: file.uploadedAt ? new Date(file.uploadedAt) : null,
        importedAt: file.importedAt ? new Date(file.importedAt) : null,
      };

      if (file.fileId) {
        transformedFile.fileId = file.fileId.toString();
      }

      return transformedFile;
    });
  }

  return mongoBatch;
}

/**
 * Di chuyển video_import_batches từ Firebase sang MongoDB
 */
async function migrateVideoImportBatches() {
  console.log('Bắt đầu di chuyển video_import_batches từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng video_import_batches
    const countSnapshot = await firestore.collection('video_import_batches').count().get();
    const totalBatches = countSnapshot.data().count;
    console.log(`Tổng số video_import_batches: ${totalBatches}`);
    
    // Di chuyển video_import_batches theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreBatches = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreBatches) {
      let query = firestore.collection('video_import_batches').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreBatches = false;
        break;
      }
      
      // Xử lý từng batch
      for (const doc of snapshot.docs) {
        try {
          const batchData = doc.data();
          const batchId = doc.id;
          
          console.log(`Đang di chuyển video_import_batch: ${batchId}`);
          
          // Chuyển đổi dữ liệu và lưu vào MongoDB
          const transformedBatch = transformBatchData(batchData, batchId);
          await db.insertDocument("video_import_batches", transformedBatch);
          
          successfulMigrations.push({
            id: batchId,
            status: batchData.status,
            filesCount: Array.isArray(batchData.files) ? batchData.files.length : 0
          });
          
          console.log(`Đã di chuyển video_import_batch thành công: ${batchId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển video_import_batch ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            status: doc.data().status,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalBatches} video_import_batches`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN VIDEO IMPORT BATCHES =====');
    console.log(`Tổng số video_import_batches: ${totalBatches}`);
    console.log(`Số video_import_batches đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số video_import_batches di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác video_import_batches di chuyển thất bại:');
      failedMigrations.forEach((batch, index) => {
        console.log(`${index + 1}. ${batch.id} (${batch.status}) - Lỗi: ${batch.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-video_import_batches-report.json', JSON.stringify({
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-video_import_batches-report.json');
    console.log('\nHoàn thành di chuyển video_import_batches');
  } catch (error) {
    console.error('Lỗi khi di chuyển video_import_batches:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu video_import_batches từ Firebase sang MongoDB');
    await migrateVideoImportBatches();
    console.log('Hoàn thành quá trình di chuyển video_import_batches');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 