/**
 * Script di chuyển dữ liệu video_views từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-video_views.js
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
 * Chuyển đổi dữ liệu video_view từ cấu trúc Firebase sang MongoDB
 * @param {Object} firebaseVideoView - Dữ liệu video_view từ Firebase
 * @param {string} videoViewId - ID của video_view
 * @returns {Object} - Dữ liệu video_view đã chuyển đổi cho MongoDB
 */
function transformVideoViewData(firebaseVideoView, videoViewId) {
  // Chuyển đổi dữ liệu, giữ nguyên ID
  const mongoVideoView = {
    _id: videoViewId, // Sử dụng ID từ Firebase làm _id trong MongoDB
    ...firebaseVideoView,
    // Chuyển đổi timestamps
    createdAt: firebaseVideoView.createdAt ? new Date(firebaseVideoView.createdAt) : new Date(),
    updatedAt: firebaseVideoView.updatedAt ? new Date(firebaseVideoView.updatedAt) : new Date(),
    viewedAt: firebaseVideoView.viewedAt ? new Date(firebaseVideoView.viewedAt) : new Date(),
  };

  // Chuyển đổi các ID sang string nếu cần
  if (mongoVideoView.videoId) {
    mongoVideoView.videoId = mongoVideoView.videoId.toString();
  }

  if (mongoVideoView.userId) {
    mongoVideoView.userId = mongoVideoView.userId.toString();
  }

  if (mongoVideoView.courseId) {
    mongoVideoView.courseId = mongoVideoView.courseId.toString();
  }

  if (mongoVideoView.lessonId) {
    mongoVideoView.lessonId = mongoVideoView.lessonId.toString();
  }

  // Chuyển đổi các trường về thông tin thiết bị nếu có
  if (mongoVideoView.device) {
    // Giữ nguyên cấu trúc device
  }

  return mongoVideoView;
}

/**
 * Di chuyển video_views từ Firebase sang MongoDB
 */
async function migrateVideoViews() {
  console.log('Bắt đầu di chuyển video_views từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng video_views
    const countSnapshot = await firestore.collection('video_views').count().get();
    const totalVideoViews = countSnapshot.data().count;
    console.log(`Tổng số video_views: ${totalVideoViews}`);
    
    // Di chuyển video_views theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreVideoViews = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreVideoViews) {
      let query = firestore.collection('video_views').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreVideoViews = false;
        break;
      }
      
      // Xử lý từng video_view
      for (const doc of snapshot.docs) {
        try {
          const videoViewData = doc.data();
          const videoViewId = doc.id;
          
          console.log(`Đang di chuyển video_view: ${videoViewId}`);
          
          // Chuyển đổi dữ liệu và lưu vào MongoDB
          const transformedVideoView = transformVideoViewData(videoViewData, videoViewId);
          await db.insertDocument("video_views", transformedVideoView);
          
          successfulMigrations.push({
            id: videoViewId,
            videoId: videoViewData.videoId,
            userId: videoViewData.userId
          });
          
          console.log(`Đã di chuyển video_view thành công: ${videoViewId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển video_view ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            videoId: doc.data().videoId,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalVideoViews} video_views`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN VIDEO VIEWS =====');
    console.log(`Tổng số video_views: ${totalVideoViews}`);
    console.log(`Số video_views đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số video_views di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác video_views di chuyển thất bại:');
      failedMigrations.forEach((videoView, index) => {
        console.log(`${index + 1}. ${videoView.id} (Video ID: ${videoView.videoId}) - Lỗi: ${videoView.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-video_views-report.json', JSON.stringify({
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-video_views-report.json');
    console.log('\nHoàn thành di chuyển video_views');
  } catch (error) {
    console.error('Lỗi khi di chuyển video_views:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu video_views từ Firebase sang MongoDB');
    await migrateVideoViews();
    console.log('Hoàn thành quá trình di chuyển video_views');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 