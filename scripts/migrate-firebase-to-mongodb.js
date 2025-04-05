const admin = require('firebase-admin');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

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

// Kết nối MongoDB
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI không được định nghĩa trong biến môi trường');
  process.exit(1);
}

const client = new MongoClient(uri);

// Danh sách các collection cần migrate
const COLLECTIONS_TO_MIGRATE = [
  'users',
  // Thêm các collection khác ở đây
];

// Kích thước batch cho mỗi lần xử lý
const BATCH_SIZE = 100;

/**
 * Hàm chuyển đổi dữ liệu từ một collection Firestore sang MongoDB
 * @param {string} collectionName - Tên collection cần chuyển đổi
 */
async function migrateCollection(collectionName) {
  console.log(`Bắt đầu chuyển đổi collection: ${collectionName}`);
  
  const db = client.db();
  const mongoCollection = db.collection(collectionName);
  const firestore = admin.firestore();
  
  try {
    // Đếm số lượng documents trong collection
    const countSnapshot = await firestore.collection(collectionName).count().get();
    const totalDocuments = countSnapshot.data().count;
    console.log(`Tổng số documents trong ${collectionName}: ${totalDocuments}`);
    
    // Lấy tất cả documents từ Firestore theo batches
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreDocuments = true;
    
    while (hasMoreDocuments) {
      let query = firestore.collection(collectionName).orderBy('__name__').limit(BATCH_SIZE);
      
      if (lastDocRef) {
        query = query.startAfter(lastDocRef);
      }
      
      const snapshot = await query.get();
      
      if (snapshot.empty) {
        hasMoreDocuments = false;
        break;
      }
      
      const batch = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        
        // Chuyển đổi timestamp của Firestore sang MongoDB Date
        Object.keys(data).forEach(key => {
          if (data[key] && typeof data[key].toDate === 'function') {
            data[key] = data[key].toDate();
          }
        });
        
        batch.push({
          _id: doc.id,
          ...data
        });
        
        lastDocRef = doc;
      });
      
      // Thêm dữ liệu vào MongoDB
      if (batch.length > 0) {
        await mongoCollection.insertMany(batch, { ordered: false }).catch(err => {
          // Xử lý lỗi trùng ID
          if (err.code === 11000) {
            console.warn(`Đã bỏ qua ${err.writeErrors.length} documents đã tồn tại trong MongoDB`);
          } else {
            throw err;
          }
        });
      }
      
      processedCount += batch.length;
      console.log(`Đã xử lý ${processedCount}/${totalDocuments} documents trong ${collectionName}`);
    }
    
    console.log(`Hoàn thành chuyển đổi collection ${collectionName}`);
  } catch (error) {
    console.error(`Lỗi khi chuyển đổi ${collectionName}:`, error);
  }
}

/**
 * Hàm chính để chạy quá trình chuyển đổi
 */
async function runMigration() {
  try {
    console.log('Bắt đầu quá trình chuyển đổi từ Firebase sang MongoDB');
    
    await client.connect();
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Chuyển đổi lần lượt từng collection
    for (const collection of COLLECTIONS_TO_MIGRATE) {
      await migrateCollection(collection);
    }
    
    console.log('Hoàn thành quá trình chuyển đổi');
  } catch (error) {
    console.error('Lỗi trong quá trình chuyển đổi:', error);
  } finally {
    await client.close();
    process.exit(0);
  }
}

// Chạy quá trình chuyển đổi
runMigration(); 