/**
 * Script di chuyển dữ liệu users từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-users.js
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
 * Chuyển đổi dữ liệu user từ cấu trúc Firebase sang MongoDB
 * @param {Object} firebaseUser - Dữ liệu user từ Firebase
 * @param {string} userId - ID của user
 * @returns {Object} - Dữ liệu user đã chuyển đổi cho MongoDB
 */
function transformUserData(firebaseUser, userId) {
  // Chuyển đổi dữ liệu, giữ nguyên ID
  const mongoUser = {
    _id: userId, // Sử dụng ID từ Firebase làm _id trong MongoDB
    ...firebaseUser,
    // Chuyển đổi timestamps
    createdAt: firebaseUser.createdAt ? new Date(firebaseUser.createdAt) : new Date(),
    updatedAt: firebaseUser.updatedAt ? new Date(firebaseUser.updatedAt) : new Date(),
  };

  // Xử lý các trường đặc biệt nếu cần
  if (mongoUser.lastLogin && typeof mongoUser.lastLogin !== 'object') {
    mongoUser.lastLogin = new Date(mongoUser.lastLogin);
  }

  return mongoUser;
}

/**
 * Di chuyển users từ Firebase sang MongoDB
 */
async function migrateUsers() {
  console.log('Bắt đầu di chuyển users từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng users
    const countSnapshot = await firestore.collection('users').count().get();
    const totalUsers = countSnapshot.data().count;
    console.log(`Tổng số users: ${totalUsers}`);
    
    // Di chuyển users theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreUsers = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreUsers) {
      let query = firestore.collection('users').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreUsers = false;
        break;
      }
      
      // Xử lý từng user
      for (const doc of snapshot.docs) {
        try {
          const userData = doc.data();
          const userId = doc.id;
          
          console.log(`Đang di chuyển user: ${userData.email || userId}`);
          
          // Chuyển đổi dữ liệu và lưu vào MongoDB
          const transformedUser = transformUserData(userData, userId);
          await db.insertDocument("users", transformedUser);
          
          successfulMigrations.push({
            id: userId,
            email: userData.email
          });
          
          console.log(`Đã di chuyển user thành công: ${userData.email || userId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển user ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            email: doc.data().email,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalUsers} users`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN USERS =====');
    console.log(`Tổng số users: ${totalUsers}`);
    console.log(`Số users đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số users di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác users di chuyển thất bại:');
      failedMigrations.forEach((user, index) => {
        console.log(`${index + 1}. ${user.email || user.id} - Lỗi: ${user.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-users-report.json', JSON.stringify({
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-users-report.json');
    console.log('\nHoàn thành di chuyển users');
  } catch (error) {
    console.error('Lỗi khi di chuyển users:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu users từ Firebase sang MongoDB');
    await migrateUsers();
    console.log('Hoàn thành quá trình di chuyển users');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 