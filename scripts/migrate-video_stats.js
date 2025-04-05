/**
 * Script di chuyển dữ liệu video_stats từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-video_stats.js
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
 * Chuyển đổi dữ liệu video_stat từ cấu trúc Firebase sang MongoDB
 * @param {Object} firebaseVideoStat - Dữ liệu video_stat từ Firebase
 * @param {string} videoStatId - ID của video_stat
 * @returns {Object} - Dữ liệu video_stat đã chuyển đổi cho MongoDB
 */
function transformVideoStatData(firebaseVideoStat, videoStatId) {
  // Chuyển đổi dữ liệu, giữ nguyên ID
  const mongoVideoStat = {
    _id: videoStatId, // Sử dụng ID từ Firebase làm _id trong MongoDB
    ...firebaseVideoStat,
    // Chuyển đổi timestamps
    createdAt: firebaseVideoStat.createdAt ? new Date(firebaseVideoStat.createdAt) : new Date(),
    updatedAt: firebaseVideoStat.updatedAt ? new Date(firebaseVideoStat.updatedAt) : new Date(),
    lastViewedAt: firebaseVideoStat.lastViewedAt ? new Date(firebaseVideoStat.lastViewedAt) : null,
  };

  // Chuyển đổi các ID sang string nếu cần
  if (mongoVideoStat.videoId) {
    mongoVideoStat.videoId = mongoVideoStat.videoId.toString();
  }

  if (mongoVideoStat.courseId) {
    mongoVideoStat.courseId = mongoVideoStat.courseId.toString();
  }

  if (mongoVideoStat.lessonId) {
    mongoVideoStat.lessonId = mongoVideoStat.lessonId.toString();
  }

  // Chuyển đổi viewsByDay từ object sang array nếu có
  if (mongoVideoStat.viewsByDay && typeof mongoVideoStat.viewsByDay === 'object') {
    const viewsByDayArray = [];
    for (const [date, count] of Object.entries(mongoVideoStat.viewsByDay)) {
      viewsByDayArray.push({
        date: new Date(date),
        count: count
      });
    }
    mongoVideoStat.viewsByDayArray = viewsByDayArray;
  }

  return mongoVideoStat;
}

/**
 * Di chuyển video_stats từ Firebase sang MongoDB
 */
async function migrateVideoStats() {
  console.log('Bắt đầu di chuyển video_stats từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng video_stats
    const countSnapshot = await firestore.collection('video_stats').count().get();
    const totalVideoStats = countSnapshot.data().count;
    console.log(`Tổng số video_stats: ${totalVideoStats}`);
    
    // Di chuyển video_stats theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreVideoStats = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreVideoStats) {
      let query = firestore.collection('video_stats').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreVideoStats = false;
        break;
      }
      
      // Xử lý từng video_stat
      for (const doc of snapshot.docs) {
        try {
          const videoStatData = doc.data();
          const videoStatId = doc.id;
          
          console.log(`Đang di chuyển video_stat: ${videoStatId}`);
          
          // Chuyển đổi dữ liệu và lưu vào MongoDB
          const transformedVideoStat = transformVideoStatData(videoStatData, videoStatId);
          await db.insertDocument("video_stats", transformedVideoStat);
          
          successfulMigrations.push({
            id: videoStatId,
            videoId: videoStatData.videoId,
            views: videoStatData.views
          });
          
          console.log(`Đã di chuyển video_stat thành công: ${videoStatId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển video_stat ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            videoId: doc.data().videoId,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalVideoStats} video_stats`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN VIDEO STATS =====');
    console.log(`Tổng số video_stats: ${totalVideoStats}`);
    console.log(`Số video_stats đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số video_stats di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác video_stats di chuyển thất bại:');
      failedMigrations.forEach((videoStat, index) => {
        console.log(`${index + 1}. ${videoStat.id} (Video ID: ${videoStat.videoId}) - Lỗi: ${videoStat.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-video_stats-report.json', JSON.stringify({
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-video_stats-report.json');
    console.log('\nHoàn thành di chuyển video_stats');
  } catch (error) {
    console.error('Lỗi khi di chuyển video_stats:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu video_stats từ Firebase sang MongoDB');
    await migrateVideoStats();
    console.log('Hoàn thành quá trình di chuyển video_stats');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 