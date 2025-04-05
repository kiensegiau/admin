/**
 * Script tạo indexes cho các collection trong MongoDB
 * Chạy script: node scripts/indexes/create-indexes.js
 */

const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

// Tải biến môi trường
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Kết nối MongoDB
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI không được định nghĩa trong biến môi trường');
  process.exit(1);
}

const client = new MongoClient(uri);

/**
 * Tạo indexes cho các collection
 */
async function createIndexes() {
  try {
    await client.connect();
    console.log('Đã kết nối thành công đến MongoDB');
    
    const db = client.db();
    
    // Index cho users collection
    console.log('Tạo indexes cho collection users...');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ uid: 1 }, { unique: true, sparse: true });
    await db.collection('users').createIndex({ fullName: 'text' });
    await db.collection('users').createIndex({ isActive: 1 });
    await db.collection('users').createIndex({ role: 1 });
    await db.collection('users').createIndex({ createdAt: -1 });
    
    // Index cho userProfiles collection
    console.log('Tạo indexes cho collection userProfiles...');
    await db.collection('userProfiles').createIndex({ userId: 1 }, { unique: true });
    await db.collection('userProfiles').createIndex({ 'preferences.theme': 1 });
    
    // Index cho userFinances collection
    console.log('Tạo indexes cho collection userFinances...');
    await db.collection('userFinances').createIndex({ userId: 1 }, { unique: true });
    await db.collection('userFinances').createIndex({ balance: 1 });
    
    // Index cho transactions collection
    console.log('Tạo indexes cho collection transactions...');
    await db.collection('transactions').createIndex({ userId: 1 });
    await db.collection('transactions').createIndex({ type: 1 });
    await db.collection('transactions').createIndex({ status: 1 });
    await db.collection('transactions').createIndex({ createdAt: -1 });
    await db.collection('transactions').createIndex({ type: 1, createdAt: -1 });
    await db.collection('transactions').createIndex({ userId: 1, createdAt: -1 });
    
    // Index cho courses collection (nếu có)
    console.log('Tạo indexes cho collection courses...');
    await db.collection('courses').createIndex({ slug: 1 }, { unique: true });
    await db.collection('courses').createIndex({ title: 'text', description: 'text' });
    await db.collection('courses').createIndex({ authorId: 1 });
    await db.collection('courses').createIndex({ categoryId: 1 });
    await db.collection('courses').createIndex({ status: 1 });
    await db.collection('courses').createIndex({ featured: 1 });
    await db.collection('courses').createIndex({ createdAt: -1 });
    
    // Index cho userCourses collection (nếu có)
    console.log('Tạo indexes cho collection userCourses...');
    await db.collection('userCourses').createIndex({ userId: 1, courseId: 1 }, { unique: true });
    await db.collection('userCourses').createIndex({ userId: 1 });
    await db.collection('userCourses').createIndex({ courseId: 1 });
    await db.collection('userCourses').createIndex({ enrolledAt: -1 });
    await db.collection('userCourses').createIndex({ expiresAt: 1 });
    
    console.log('Hoàn thành tạo indexes');
  } catch (error) {
    console.error('Lỗi khi tạo indexes:', error);
  } finally {
    await client.close();
  }
}

// Chạy hàm tạo indexes
createIndexes()
  .then(() => {
    console.log('Script hoàn thành');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Lỗi khi chạy script:', error);
    process.exit(1);
  }); 