/**
 * Cấu trúc dữ liệu MongoDB
 * - Định nghĩa cấu trúc các collection
 * - Quy định quan hệ giữa các collection
 */

// Collection Users - Thông tin cơ bản người dùng
const UserSchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  uid: 'String', // ID từ Firebase Auth
  email: 'String',
  fullName: 'String',
  phoneNumber: 'String', // Optional
  isActive: 'Boolean',
  role: 'String', // admin, user, teacher, ...
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Collection UserProfiles - Thông tin chi tiết người dùng
const UserProfileSchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  userId: 'ObjectId', // Reference đến Users collection
  avatar: 'String', // URL ảnh đại diện
  address: 'String',
  bio: 'String',
  dateOfBirth: 'Date',
  socialLinks: {
    facebook: 'String',
    twitter: 'String',
    // Các mạng xã hội khác
  },
  preferences: {
    theme: 'String',
    notifications: 'Boolean',
    // Các tùy chọn khác
  },
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Collection UserFinance - Thông tin tài chính người dùng
const UserFinanceSchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  userId: 'ObjectId', // Reference đến Users collection
  balance: 'Number', // Số dư tài khoản
  totalDeposit: 'Number', // Tổng số tiền đã nạp
  totalSpent: 'Number', // Tổng số tiền đã chi
  paymentMethods: [
    {
      type: 'String', // bank, card, e-wallet
      details: 'Object', // Chi tiết phương thức thanh toán
      isDefault: 'Boolean',
    },
  ],
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Collection Transactions - Lịch sử giao dịch
const TransactionSchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  userId: 'ObjectId', // Reference đến Users collection
  type: 'String', // deposit, withdraw, purchase, refund, ...
  amount: 'Number',
  balanceBefore: 'Number',
  balanceAfter: 'Number',
  status: 'String', // pending, completed, failed, cancelled
  description: 'String',
  metadata: 'Object', // Dữ liệu bổ sung liên quan đến giao dịch
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Collection Courses - Thông tin khóa học
const CourseSchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  title: 'String',
  slug: 'String',
  description: 'String',
  shortDescription: 'String',
  thumbnail: 'String',
  price: 'Number',
  discountPrice: 'Number',
  categoryId: 'ObjectId', // Reference đến Categories collection
  authorId: 'ObjectId', // Reference đến Users collection
  status: 'String', // draft, published, archived
  featured: 'Boolean',
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Collection CourseContent - Nội dung chi tiết khóa học
const CourseContentSchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  courseId: 'ObjectId', // Reference đến Courses collection
  sections: [
    {
      title: 'String',
      order: 'Number',
      lessons: [
        {
          title: 'String',
          description: 'String',
          type: 'String', // video, text, quiz, ...
          content: 'String', // URL video, nội dung text, ...
          duration: 'Number', // Thời lượng bài học (giây)
          order: 'Number',
          isPreview: 'Boolean', // Có phải bài học xem thử không
        },
      ],
    },
  ],
  totalLessons: 'Number',
  totalDuration: 'Number', // Tổng thời lượng khóa học (giây)
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Collection UserCourses - Mối quan hệ giữa User và Course
const UserCourseSchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  userId: 'ObjectId', // Reference đến Users collection
  courseId: 'ObjectId', // Reference đến Courses collection
  enrolledAt: 'Date',
  expiresAt: 'Date', // Ngày hết hạn (nếu có)
  progress: 'Number', // Tiến độ hoàn thành (%)
  lastAccessedAt: 'Date',
  completedAt: 'Date',
  certificate: {
    issued: 'Boolean',
    issuedAt: 'Date',
    url: 'String',
  },
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Collection Categories - Danh mục khóa học
const CategorySchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  name: 'String',
  slug: 'String',
  description: 'String',
  icon: 'String',
  parentId: 'ObjectId', // Reference đến Categories collection (nếu là danh mục con)
  order: 'Number',
  isActive: 'Boolean',
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Collection UserLessonProgress - Theo dõi tiến độ từng bài học
const UserLessonProgressSchema = {
  _id: 'ObjectId', // Tự động tạo bởi MongoDB
  userId: 'ObjectId', // Reference đến Users collection
  courseId: 'ObjectId', // Reference đến Courses collection
  lessonId: 'String', // ID của bài học
  progress: 'Number', // Tiến độ (0-100%)
  completed: 'Boolean',
  watchTime: 'Number', // Thời gian đã xem (giây)
  lastPosition: 'Number', // Vị trí cuối cùng (giây)
  notes: 'String', // Ghi chú của người dùng
  createdAt: 'Date',
  updatedAt: 'Date',
};

// Export các schema
module.exports = {
  UserSchema,
  UserProfileSchema,
  UserFinanceSchema,
  TransactionSchema,
  CourseSchema,
  CourseContentSchema,
  UserCourseSchema,
  CategorySchema,
  UserLessonProgressSchema,
}; 