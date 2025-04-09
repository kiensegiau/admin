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
  
  // Lấy stack trace để biết được file nào đang gọi hàm
  const stackTrace = new Error().stack;
  let callerInfo = 'Unknown';
  
  // Phân tích stack trace để lấy thông tin file gọi
  try {
    // Tách stack trace thành các dòng
    const stackLines = stackTrace.split('\n');
    // Tìm dòng đầu tiên không phải từ db.js (thường là dòng thứ 3 trở đi)
    let callerLine = '';
    for (let i = 3; i < stackLines.length; i++) {
      if (!stackLines[i].includes('lib/db.js')) {
        callerLine = stackLines[i];
        break;
      }
    }
    
    // Trích xuất tên file và thư mục
    if (callerLine) {
      // Loại bỏ phần đầu không cần thiết và lấy phần đường dẫn
      const match = callerLine.match(/\((.+?):(\d+):(\d+)\)/) || callerLine.match(/at (.+?):(\d+):(\d+)/);
      if (match && match[1]) {
        const fullPath = match[1];
        // Lấy phần path ngắn hơn để log gọn hơn (bỏ phần base directory)
        const pathParts = fullPath.split('/');
        if (pathParts.length > 2) {
          callerInfo = pathParts.slice(Math.max(0, pathParts.length - 3)).join('/');
        } else {
          callerInfo = fullPath;
        }
      }
    }
  } catch (err) {
    // Nếu có lỗi khi phân tích, giữ nguyên giá trị mặc định
    console.error('Lỗi khi phân tích stack trace:', err);
  }
  
  try {
    const result = await dbOperation();
    const responseTime = Date.now() - startTime;
    console.log(`[DB] ${operation} - ${collection} từ [${callerInfo}] - ${responseTime}ms`);
    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`[Lỗi DB] ${operation} - ${collection} từ [${callerInfo}] - ${responseTime}ms:`, error);
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
    console.log('Đã kết nối tới MongoDB');
    return { db: dbConnection, client };
  } catch (error) {
    console.error('Kết nối tới MongoDB thất bại', error);
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