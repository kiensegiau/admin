/**
 * Script di chuyển dữ liệu drivePermissions từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-drivePermissions.js
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
 * Chuyển đổi dữ liệu drivePermission từ cấu trúc Firebase sang MongoDB
 * @param {Object} firebaseDrivePermission - Dữ liệu drivePermission từ Firebase
 * @param {string} drivePermissionId - ID của drivePermission
 * @returns {Object} - Dữ liệu drivePermission đã chuyển đổi cho MongoDB
 */
function transformDrivePermissionData(firebaseDrivePermission, drivePermissionId) {
  // Chuyển đổi dữ liệu, giữ nguyên ID
  const mongoDrivePermission = {
    _id: drivePermissionId, // Sử dụng ID từ Firebase làm _id trong MongoDB
    ...firebaseDrivePermission,
    // Chuyển đổi timestamps
    createdAt: firebaseDrivePermission.createdAt ? new Date(firebaseDrivePermission.createdAt) : new Date(),
    updatedAt: firebaseDrivePermission.updatedAt ? new Date(firebaseDrivePermission.updatedAt) : new Date(),
  };

  // Chuyển đổi các ID sang string nếu cần
  if (mongoDrivePermission.userId) {
    mongoDrivePermission.userId = mongoDrivePermission.userId.toString();
  }

  if (mongoDrivePermission.courseId) {
    mongoDrivePermission.courseId = mongoDrivePermission.courseId.toString();
  }

  if (mongoDrivePermission.fileId) {
    mongoDrivePermission.fileId = mongoDrivePermission.fileId.toString();
  }

  // Xử lý các trường đặc biệt khác nếu cần

  return mongoDrivePermission;
}

/**
 * Di chuyển drivePermissions từ Firebase sang MongoDB
 */
async function migrateDrivePermissions() {
  console.log('Bắt đầu di chuyển drivePermissions từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng drivePermissions
    const countSnapshot = await firestore.collection('drivePermissions').count().get();
    const totalDrivePermissions = countSnapshot.data().count;
    console.log(`Tổng số drivePermissions: ${totalDrivePermissions}`);
    
    // Di chuyển drivePermissions theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreDrivePermissions = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreDrivePermissions) {
      let query = firestore.collection('drivePermissions').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreDrivePermissions = false;
        break;
      }
      
      // Xử lý từng drivePermission
      for (const doc of snapshot.docs) {
        try {
          const drivePermissionData = doc.data();
          const drivePermissionId = doc.id;
          
          console.log(`Đang di chuyển drivePermission: ${drivePermissionId}`);
          
          // Chuyển đổi dữ liệu và lưu vào MongoDB
          const transformedDrivePermission = transformDrivePermissionData(drivePermissionData, drivePermissionId);
          await db.insertDocument("drivePermissions", transformedDrivePermission);
          
          successfulMigrations.push({
            id: drivePermissionId,
            email: drivePermissionData.email,
            role: drivePermissionData.role
          });
          
          console.log(`Đã di chuyển drivePermission thành công: ${drivePermissionId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển drivePermission ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            email: doc.data().email,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalDrivePermissions} drivePermissions`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN DRIVE PERMISSIONS =====');
    console.log(`Tổng số drivePermissions: ${totalDrivePermissions}`);
    console.log(`Số drivePermissions đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số drivePermissions di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác drivePermissions di chuyển thất bại:');
      failedMigrations.forEach((drivePermission, index) => {
        console.log(`${index + 1}. ${drivePermission.id} (${drivePermission.email}) - Lỗi: ${drivePermission.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-drivePermissions-report.json', JSON.stringify({
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-drivePermissions-report.json');
    console.log('\nHoàn thành di chuyển drivePermissions');
  } catch (error) {
    console.error('Lỗi khi di chuyển drivePermissions:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu drivePermissions từ Firebase sang MongoDB');
    await migrateDrivePermissions();
    console.log('Hoàn thành quá trình di chuyển drivePermissions');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 