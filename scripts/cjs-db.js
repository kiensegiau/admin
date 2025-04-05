/**
 * DB Utility dành riêng cho các scripts Node.js
 * Tạo file này để tránh lỗi '@/lib/...' path không hợp lệ trong Node.js
 */

const { MongoClient, ObjectId } = require('mongodb');

// Kết nối đến MongoDB
let client;
let dbConnection;
let isConnected = false;

const connectToDatabase = async (uri) => {
  if (isConnected) {
    return { db: dbConnection, client };
  }

  if (!uri) {
    throw new Error('MONGODB_URI is not defined');
  }

  try {
    client = new MongoClient(uri);
    await client.connect();
    dbConnection = client.db(process.env.MONGODB_DB || 'hocmai');
    isConnected = true;
    console.log('Connected to MongoDB');
    return { db: dbConnection, client };
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    throw error;
  }
};

/**
 * Tìm một tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @returns {Promise<Object|null>} - Tài liệu tìm thấy hoặc null
 */
const findOneDocument = async (collection, query) => {
  const { db } = await connectToDatabase(process.env.MONGODB_URI);
  return db.collection(collection).findOne(query);
};

/**
 * Tìm nhiều tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @param {Object} options - Các tùy chọn như sort, limit, skip
 * @returns {Promise<Array>} - Mảng các tài liệu tìm thấy
 */
const findDocuments = async (collection, query = {}, options = {}) => {
  const { db } = await connectToDatabase(process.env.MONGODB_URI);
  return db.collection(collection).find(query, options).toArray();
};

/**
 * Thêm một tài liệu vào collection
 * @param {string} collection - Tên collection
 * @param {Object} document - Tài liệu cần thêm
 * @returns {Promise<Object>} - Kết quả của thao tác thêm
 */
const insertDocument = async (collection, document) => {
  const { db } = await connectToDatabase(process.env.MONGODB_URI);
  return db.collection(collection).insertOne(document);
};

/**
 * Thêm nhiều tài liệu vào collection
 * @param {string} collection - Tên collection
 * @param {Array} documents - Mảng các tài liệu cần thêm
 * @returns {Promise<Object>} - Kết quả của thao tác thêm
 */
const insertDocuments = async (collection, documents) => {
  const { db } = await connectToDatabase(process.env.MONGODB_URI);
  return db.collection(collection).insertMany(documents);
};

/**
 * Cập nhật một tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @param {Object} update - Dữ liệu cập nhật
 * @param {Object} options - Các tùy chọn như upsert
 * @returns {Promise<Object>} - Kết quả của thao tác cập nhật
 */
const updateDocument = async (collection, query, update, options = {}) => {
  const { db } = await connectToDatabase(process.env.MONGODB_URI);
  return db.collection(collection).updateOne(query, update, options);
};

/**
 * Xóa một tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @returns {Promise<Object>} - Kết quả của thao tác xóa
 */
const deleteDocument = async (collection, query) => {
  const { db } = await connectToDatabase(process.env.MONGODB_URI);
  return db.collection(collection).deleteOne(query);
};

module.exports = {
  connectToDatabase,
  findOneDocument,
  findDocuments,
  insertDocument,
  insertDocuments,
  updateDocument,
  deleteDocument,
  ObjectId
}; 