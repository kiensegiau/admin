/**
 * Script di chuyển dữ liệu transactions từ Firebase sang MongoDB
 * Chạy script: node scripts/migrate-transactions.js
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
 * Chuyển đổi dữ liệu transaction từ cấu trúc Firebase sang MongoDB
 * @param {Object} firebaseTransaction - Dữ liệu transaction từ Firebase
 * @param {string} transactionId - ID của transaction
 * @returns {Object} - Dữ liệu transaction đã chuyển đổi cho MongoDB
 */
function transformTransactionData(firebaseTransaction, transactionId) {
  // Chuyển đổi dữ liệu, giữ nguyên ID
  const mongoTransaction = {
    _id: transactionId, // Sử dụng ID từ Firebase làm _id trong MongoDB
    ...firebaseTransaction,
    // Chuyển đổi timestamps
    createdAt: firebaseTransaction.createdAt ? new Date(firebaseTransaction.createdAt) : new Date(),
    updatedAt: firebaseTransaction.updatedAt ? new Date(firebaseTransaction.updatedAt) : new Date(),
    paymentDate: firebaseTransaction.paymentDate ? new Date(firebaseTransaction.paymentDate) : null,
  };

  // Chuyển đổi ID sang string nếu cần
  if (mongoTransaction.userId) {
    mongoTransaction.userId = mongoTransaction.userId.toString();
  }

  if (mongoTransaction.courseId) {
    mongoTransaction.courseId = mongoTransaction.courseId.toString();
  }

  // Xử lý các trường đặc biệt khác nếu cần

  return mongoTransaction;
}

/**
 * Di chuyển transactions từ Firebase sang MongoDB
 */
async function migrateTransactions() {
  console.log('Bắt đầu di chuyển transactions từ Firebase sang MongoDB...');
  
  try {
    // Thiết lập kết nối đến MongoDB
    await db.connectToDatabase(uri);
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng transactions
    const countSnapshot = await firestore.collection('transactions').count().get();
    const totalTransactions = countSnapshot.data().count;
    console.log(`Tổng số transactions: ${totalTransactions}`);
    
    // Di chuyển transactions theo batch
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreTransactions = true;
    
    const successfulMigrations = [];
    const failedMigrations = [];
    
    while (hasMoreTransactions) {
      let query = firestore.collection('transactions').orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreTransactions = false;
        break;
      }
      
      // Xử lý từng transaction
      for (const doc of snapshot.docs) {
        try {
          const transactionData = doc.data();
          const transactionId = doc.id;
          
          console.log(`Đang di chuyển transaction: ${transactionId}`);
          
          // Chuyển đổi dữ liệu và lưu vào MongoDB
          const transformedTransaction = transformTransactionData(transactionData, transactionId);
          await db.insertDocument("transactions", transformedTransaction);
          
          successfulMigrations.push({
            id: transactionId,
            status: transactionData.status,
            amount: transactionData.amount,
            userId: transactionData.userId
          });
          
          console.log(`Đã di chuyển transaction thành công: ${transactionId}`);
        } catch (error) {
          console.error(`Lỗi khi di chuyển transaction ${doc.id}:`, error);
          
          failedMigrations.push({
            id: doc.id,
            status: doc.data().status,
            error: error.message
          });
        }
        
        lastDocRef = doc;
        processedCount++;
      }
      
      console.log(`Đã xử lý ${processedCount}/${totalTransactions} transactions`);
    }
    
    // Tạo báo cáo
    console.log('\n===== BÁO CÁO DI CHUYỂN TRANSACTIONS =====');
    console.log(`Tổng số transactions: ${totalTransactions}`);
    console.log(`Số transactions đã di chuyển thành công: ${successfulMigrations.length}`);
    console.log(`Số transactions di chuyển thất bại: ${failedMigrations.length}`);
    
    if (failedMigrations.length > 0) {
      console.log('\nCác transactions di chuyển thất bại:');
      failedMigrations.forEach((transaction, index) => {
        console.log(`${index + 1}. ${transaction.id} (${transaction.status}) - Lỗi: ${transaction.error}`);
      });
    }
    
    // Lưu báo cáo vào file
    fs.writeFileSync('migration-transactions-report.json', JSON.stringify({
      successful: successfulMigrations,
      failed: failedMigrations
    }, null, 2));
    
    console.log('\nĐã lưu báo cáo chi tiết vào file migration-transactions-report.json');
    console.log('\nHoàn thành di chuyển transactions');
  } catch (error) {
    console.error('Lỗi khi di chuyển transactions:', error);
  }
}

/**
 * Hàm chính để chạy quá trình di chuyển
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình di chuyển dữ liệu transactions từ Firebase sang MongoDB');
    await migrateTransactions();
    console.log('Hoàn thành quá trình di chuyển transactions');
  } catch (error) {
    console.error('Lỗi trong quá trình di chuyển:', error);
  } finally {
    process.exit(0);
  }
}

// Chạy quá trình di chuyển
runMigration(); 