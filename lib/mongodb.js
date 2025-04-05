import { MongoClient } from 'mongodb';

// Định nghĩa chuỗi URI kết nối MongoDB
const uri = process.env.MONGODB_URI;
const options = {};

// Khai báo biến client
let client;
let clientPromise;

// Kiểm tra môi trường
if (!process.env.MONGODB_URI) {
  throw new Error('Hãy thêm MONGODB_URI vào biến môi trường');
}

// Trong môi trường phát triển, sử dụng biến global để giữ kết nối
if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // Trong môi trường production, tạo kết nối mới
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Export kết nối để sử dụng trong ứng dụng
export default clientPromise; 