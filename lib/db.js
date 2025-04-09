const { MongoClient, ObjectId } = require('mongodb');

// Kết nối đến MongoDB
let client;
let dbConnection;
let isConnected = false;

/**
 * Hàm tiện ích để đo và log thời gian thực thi
 * @param {string} operation - Tên hành động đang thực hiện
 * @param {string} collection - Tên collection đang thao tác
 * @param {Function} dbOperation - Hàm thực thi DB cần đo thời gian
 * @returns {Promise<any>} - Kết quả từ hàm thực thi
 */
const logExecutionTime = async (operation, collection, dbOperation) => {
  const startTime = Date.now();
  try {
    const result = await dbOperation();
    const responseTime = Date.now() - startTime;
    console.log(`[DB] ${operation} trong '${collection}' hoàn thành trong ${responseTime}ms`);
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[DB ERROR] ${operation} trong '${collection}' thất bại sau ${responseTime}ms:`, error);
    throw error;
  }
};

const connectToDatabase = async () => {
  if (isConnected) {
    return { db: dbConnection, client };
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  try {
    client = new MongoClient(process.env.MONGODB_URI);
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
  const { db } = await connectToDatabase();
  return logExecutionTime('findOneDocument', collection, () => {
    return db.collection(collection).findOne(query);
  });
};

/**
 * Tìm nhiều tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @param {Object} options - Các tùy chọn như sort, limit, skip
 * @returns {Promise<Array>} - Mảng các tài liệu tìm thấy
 */
const findDocuments = async (collection, query = {}, options = {}) => {
  const { db } = await connectToDatabase();
  return logExecutionTime('findDocuments', collection, () => {
    return db.collection(collection).find(query, options).toArray();
  });
};

/**
 * Thêm một tài liệu vào collection
 * @param {string} collection - Tên collection
 * @param {Object} document - Tài liệu cần thêm
 * @returns {Promise<Object>} - Kết quả của thao tác thêm
 */
const insertDocument = async (collection, document) => {
  const { db } = await connectToDatabase();
  return logExecutionTime('insertDocument', collection, () => {
    return db.collection(collection).insertOne(document);
  });
};

/**
 * Thêm nhiều tài liệu vào collection
 * @param {string} collection - Tên collection
 * @param {Array} documents - Mảng các tài liệu cần thêm
 * @returns {Promise<Object>} - Kết quả của thao tác thêm
 */
const insertDocuments = async (collection, documents) => {
  const { db } = await connectToDatabase();
  return logExecutionTime('insertDocuments', collection, () => {
    return db.collection(collection).insertMany(documents);
  });
};

/**
 * Cập nhật một hoặc nhiều tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @param {Object} update - Dữ liệu cập nhật
 * @param {Object} options - Các tùy chọn như upsert
 * @returns {Promise<Object>} - Kết quả của thao tác cập nhật
 */
const updateDocument = async (collection, query, update, options = {}) => {
  const { db } = await connectToDatabase();
  return logExecutionTime('updateDocument', collection, () => {
    return db.collection(collection).updateOne(query, update, options);
  });
};

/**
 * Cập nhật nhiều tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @param {Object} update - Dữ liệu cập nhật
 * @param {Object} options - Các tùy chọn như upsert
 * @returns {Promise<Object>} - Kết quả của thao tác cập nhật
 */
const updateDocuments = async (collection, query, update, options = {}) => {
  const { db } = await connectToDatabase();
  return logExecutionTime('updateDocuments', collection, () => {
    return db.collection(collection).updateMany(query, update, options);
  });
};

/**
 * Xóa một hoặc nhiều tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @returns {Promise<Object>} - Kết quả của thao tác xóa
 */
const deleteDocument = async (collection, query) => {
  const { db } = await connectToDatabase();
  return logExecutionTime('deleteDocument', collection, () => {
    return db.collection(collection).deleteOne(query);
  });
};

/**
 * Xóa nhiều tài liệu trong collection
 * @param {string} collection - Tên collection
 * @param {Object} query - Điều kiện tìm kiếm
 * @returns {Promise<Object>} - Kết quả của thao tác xóa
 */
const deleteDocuments = async (collection, query) => {
  const { db } = await connectToDatabase();
  return logExecutionTime('deleteDocuments', collection, () => {
    return db.collection(collection).deleteMany(query);
  });
};

module.exports = {
  connectToDatabase,
  findOneDocument,
  findDocuments,
  insertDocument,
  insertDocuments,
  updateDocument,
  updateDocuments,
  deleteDocument,
  deleteDocuments,
  ObjectId
}; 