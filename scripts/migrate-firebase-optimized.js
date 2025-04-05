const admin = require('firebase-admin');
const { MongoClient, ObjectId } = require('mongodb');
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

// Kích thước batch cho mỗi lần xử lý
const BATCH_SIZE = 100;

/**
 * Chuyển đổi dữ liệu người dùng từ Firestore sang cấu trúc mới trong MongoDB
 */
async function migrateUsers() {
  console.log('Bắt đầu chuyển đổi dữ liệu người dùng...');
  
  const db = client.db();
  const usersCollection = db.collection('users');
  const userProfilesCollection = db.collection('userProfiles');
  const userFinancesCollection = db.collection('userFinances');
  
  const firestore = admin.firestore();
  
  try {
    // Đếm số lượng documents
    const countSnapshot = await firestore.collection('users').count().get();
    const totalUsers = countSnapshot.data().count;
    console.log(`Tổng số người dùng: ${totalUsers}`);
    
    // Lấy dữ liệu từ Firestore theo batches
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreUsers = true;
    
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
      
      const usersBatch = [];
      const profilesBatch = [];
      const financesBatch = [];
      
      for (const doc of snapshot.docs) {
        const userData = doc.data();
        const userId = new ObjectId();
        
        // Cấu trúc document cơ bản cho users collection
        const baseUser = {
          _id: userId,
          uid: userData.uid || null,
          email: userData.email || '',
          fullName: userData.fullName || '',
          phoneNumber: userData.phoneNumber || null,
          isActive: userData.isActive === undefined ? true : userData.isActive,
          role: userData.role || 'user',
          createdAt: userData.createdAt && typeof userData.createdAt.toDate === 'function' 
            ? userData.createdAt.toDate() 
            : new Date(),
          updatedAt: userData.updatedAt && typeof userData.updatedAt.toDate === 'function' 
            ? userData.updatedAt.toDate() 
            : new Date(),
        };
        
        // Cấu trúc document cho profiles collection
        const profile = {
          _id: new ObjectId(),
          userId: userId,
          avatar: userData.avatar || null,
          address: userData.address || null,
          bio: userData.bio || null,
          dateOfBirth: userData.dateOfBirth && typeof userData.dateOfBirth.toDate === 'function' 
            ? userData.dateOfBirth.toDate() 
            : null,
          socialLinks: userData.socialLinks || {},
          preferences: userData.preferences || {
            theme: 'light',
            notifications: true
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        // Cấu trúc document cho finances collection
        const finance = {
          _id: new ObjectId(),
          userId: userId,
          balance: userData.balance || 0,
          totalDeposit: userData.totalDeposit || 0,
          totalSpent: userData.totalSpent || 0,
          paymentMethods: userData.paymentMethods || [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        usersBatch.push(baseUser);
        profilesBatch.push(profile);
        financesBatch.push(finance);
        
        lastDocRef = doc;
      }
      
      // Thêm dữ liệu vào MongoDB
      if (usersBatch.length > 0) {
        await usersCollection.insertMany(usersBatch, { ordered: false }).catch(err => {
          if (err.code === 11000) {
            console.warn(`Đã bỏ qua ${err.writeErrors?.length || 0} người dùng đã tồn tại.`);
          } else {
            throw err;
          }
        });
        
        await userProfilesCollection.insertMany(profilesBatch, { ordered: false }).catch(err => {
          if (err.code !== 11000) throw err;
        });
        
        await userFinancesCollection.insertMany(financesBatch, { ordered: false }).catch(err => {
          if (err.code !== 11000) throw err;
        });
      }
      
      processedCount += usersBatch.length;
      console.log(`Đã xử lý ${processedCount}/${totalUsers} người dùng`);
    }
    
    console.log('Hoàn thành chuyển đổi dữ liệu người dùng');
  } catch (error) {
    console.error('Lỗi khi chuyển đổi dữ liệu người dùng:', error);
  }
}

/**
 * Chuyển đổi dữ liệu giao dịch từ Firestore sang cấu trúc mới trong MongoDB
 */
async function migrateTransactions() {
  console.log('Bắt đầu chuyển đổi dữ liệu giao dịch...');
  
  const db = client.db();
  const transactionsCollection = db.collection('transactions');
  const usersCollection = db.collection('users');
  const userFinancesCollection = db.collection('userFinances');
  
  const firestore = admin.firestore();
  
  try {
    // Đếm số lượng documents
    const countSnapshot = await firestore.collection('transactions').count().get();
    const totalTransactions = countSnapshot.data().count;
    console.log(`Tổng số giao dịch: ${totalTransactions}`);
    
    // Lấy dữ liệu từ Firestore theo batches
    let processedCount = 0;
    let lastDocRef = null;
    let hasMoreTransactions = true;
    
    // Tạo bảng ánh xạ từ userId Firestore sang ObjectId MongoDB
    const userMap = new Map();
    const userDocs = await usersCollection.find({}, { projection: { _id: 1, uid: 1 } }).toArray();
    userDocs.forEach(user => {
      if (user.uid) {
        userMap.set(user.uid, user._id);
      }
    });
    
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
      
      const transactionsBatch = [];
      
      for (const doc of snapshot.docs) {
        const txData = doc.data();
        
        // Tìm ObjectId của user trong MongoDB
        const userRef = await firestore.collection('users').doc(txData.userId).get();
        
        let mongoUserId;
        if (userRef.exists) {
          const userData = userRef.data();
          mongoUserId = userMap.get(userData.uid);
        }
        
        if (!mongoUserId) {
          console.warn(`Không tìm thấy người dùng tương ứng cho giao dịch ${doc.id}`);
          continue;
        }
        
        // Cấu trúc document cho transactions collection
        const transaction = {
          _id: new ObjectId(),
          userId: mongoUserId,
          type: txData.type || 'unknown',
          amount: txData.amount || 0,
          balanceBefore: txData.balanceBefore || 0,
          balanceAfter: txData.balanceAfter || 0,
          status: txData.status || 'completed',
          description: txData.description || '',
          metadata: txData.metadata || {},
          createdAt: txData.createdAt && typeof txData.createdAt.toDate === 'function' 
            ? txData.createdAt.toDate() 
            : new Date(),
          updatedAt: txData.updatedAt && typeof txData.updatedAt.toDate === 'function' 
            ? txData.updatedAt.toDate() 
            : new Date(),
        };
        
        transactionsBatch.push(transaction);
        lastDocRef = doc;
      }
      
      // Thêm dữ liệu vào MongoDB
      if (transactionsBatch.length > 0) {
        await transactionsCollection.insertMany(transactionsBatch, { ordered: false }).catch(err => {
          if (err.code === 11000) {
            console.warn(`Đã bỏ qua ${err.writeErrors?.length || 0} giao dịch đã tồn tại.`);
          } else {
            throw err;
          }
        });
      }
      
      processedCount += transactionsBatch.length;
      console.log(`Đã xử lý ${processedCount}/${totalTransactions} giao dịch`);
    }
    
    console.log('Hoàn thành chuyển đổi dữ liệu giao dịch');
  } catch (error) {
    console.error('Lỗi khi chuyển đổi dữ liệu giao dịch:', error);
  }
}

/**
 * Tạo indexes cho MongoDB để tối ưu truy vấn
 */
async function createIndexes() {
  console.log('Tạo indexes cho MongoDB...');
  
  const db = client.db();
  
  try {
    // Index cho users collection
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ uid: 1 }, { unique: true, sparse: true });
    await db.collection('users').createIndex({ fullName: 'text' });
    
    // Index cho userProfiles collection
    await db.collection('userProfiles').createIndex({ userId: 1 }, { unique: true });
    
    // Index cho userFinances collection
    await db.collection('userFinances').createIndex({ userId: 1 }, { unique: true });
    
    // Index cho transactions collection
    await db.collection('transactions').createIndex({ userId: 1 });
    await db.collection('transactions').createIndex({ createdAt: -1 });
    await db.collection('transactions').createIndex({ type: 1, createdAt: -1 });
    
    console.log('Hoàn thành tạo indexes');
  } catch (error) {
    console.error('Lỗi khi tạo indexes:', error);
  }
}

/**
 * Hàm chính để chạy quá trình chuyển đổi
 */
async function runOptimizedMigration() {
  try {
    console.log('Bắt đầu quá trình chuyển đổi tối ưu từ Firebase sang MongoDB');
    
    await client.connect();
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Bước 1: Tạo indexes trước để tối ưu quá trình chuyển đổi
    await createIndexes();
    
    // Bước 2: Chuyển đổi dữ liệu người dùng
    await migrateUsers();
    
    // Bước 3: Chuyển đổi dữ liệu giao dịch
    await migrateTransactions();
    
    // Các bước chuyển đổi khác có thể thêm ở đây
    // ...
    
    console.log('Hoàn thành quá trình chuyển đổi tối ưu');
  } catch (error) {
    console.error('Lỗi trong quá trình chuyển đổi:', error);
  } finally {
    await client.close();
    process.exit(0);
  }
}

// Chạy quá trình chuyển đổi tối ưu
runOptimizedMigration(); 