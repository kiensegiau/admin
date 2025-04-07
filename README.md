This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.js`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Hệ Thống Quản Lý Khóa Học

### Cấu Trúc Dữ Liệu

Hệ thống sử dụng MongoDB để lưu trữ dữ liệu khóa học với hai collection chính:

1. **Collection `courses`**: Lưu trữ thông tin tổng quan của khóa học.
   ```javascript
   {
     _id: ObjectId("..."),             // ID của khóa học
     title: "Toán Thầy Đỗ Văn Đức MAPSTUDY 2K7", // Tiêu đề khóa học
     subject: "math",                  // Môn học (math, physics, chemistry, literature, english, biology, history, geography, other)
     grade: "grade12",                 // Lớp (grade10, grade11, grade12, grade9, grade8, grade7, grade6)
     status: "draft",                  // Trạng thái (draft, published)
     price: 100000,                    // Giá (VND)
     thumbnailUrl: "https://...",      // URL hình thumbnail
     description: "Mô tả khóa học...", // Mô tả
     driveUrl: "https://drive.google.com/...", // URL Google Drive
     createdAt: ISODate("2023-01-01"), // Ngày tạo
     updatedAt: ISODate("2023-01-05")  // Ngày cập nhật
   }
   ```

2. **Collection `courseContents`**: Lưu trữ nội dung chi tiết của khóa học với cấu trúc phân cấp 4 cấp.
   ```javascript
   {
     _id: ObjectId("..."),             // ID của nội dung
     courseId: ObjectId("..."),        // Tham chiếu đến ID của khóa học trong collection courses
     chapters: [                       // Danh sách chương (cấp 1)
       {
         id: "uuid-string",            // ID của chương (UUID string)
         name: "Chương 1: Đại số",     // Tên chương
         createdAt: "2023-01-01T00:00:00.000Z", // Ngày tạo (ISO format)
         updatedAt: "2023-01-01T00:00:00.000Z", // Ngày cập nhật (ISO format)
         lessons: [                    // Danh sách bài học trong chương (cấp 2)
           {
             id: "uuid-string",        // ID của bài học (UUID string)
             name: "Bài 1: Hàm số",    // Tên bài học
             createdAt: "2023-01-01T00:00:00.000Z", // Ngày tạo (ISO format)
             updatedAt: "2023-01-01T00:00:00.000Z", // Ngày cập nhật (ISO format)
             files: [                  // Danh sách file trong bài học
               {
                 id: "uuid-string",    // ID của file
                 name: "video-bai-giang.mp4", // Tên file hiển thị
                 originalName: "video-goc.mp4", // Tên file gốc
                 mimeType: "video/mp4", // Loại MIME
                 type: "video",        // Loại file (video, document, audio, ...)
                 size: 104857600,      // Kích thước file (byte)
                 driveFileId: "1Abc123XYZ", // ID của file trên Google Drive
                 uploadTime: "2023-01-01T00:00:00.000Z", // Thời điểm upload (ISO format)
                 modifiedTime: "2023-01-01T00:00:00.000Z", // Thời điểm sửa đổi (ISO format)
                 status: "ready",      // Trạng thái file (ready, processing, error)
                 storage: {
                   provider: "wasabi", // Nhà cung cấp lưu trữ (wasabi, local, ...)
                   key: "courses/course-id/ten-file.mp4", // Đường dẫn lưu trữ
                   size: 104857600,    // Kích thước lưu trữ (byte)
                   uploadTime: "2023-01-01T00:00:00.000Z" // Thời điểm upload lên storage
                 }
               }
             ],
             subfolders: [            // Danh sách thư mục con trong bài học (cấp 3)
               {
                 id: "uuid-string",   // ID của thư mục con
                 name: "Tài liệu bổ sung", // Tên thư mục con
                 createdAt: "2023-01-01T00:00:00.000Z", // Ngày tạo (ISO format)
                 updatedAt: "2023-01-01T00:00:00.000Z", // Ngày cập nhật (ISO format)
                 files: [             // Danh sách file trong thư mục con
                   {
                     // Cấu trúc giống như files ở trên
                     id: "uuid-string",
                     name: "tai-lieu.pdf",
                     // ... các thuộc tính khác
                     storage: {
                       provider: "wasabi",
                       key: "courses/course-id/ten-thu-muc/ten-file.pdf",
                       // ... các thuộc tính khác
                     }
                   }
                 ],
                 subsubfolders: [     // Danh sách thư mục con của thư mục con (cấp 4)
                   {
                     id: "uuid-string", // ID của thư mục con cấp 4
                     name: "Bài tập", // Tên thư mục con cấp 4
                     createdAt: "2023-01-01T00:00:00.000Z", // Ngày tạo (ISO format)
                     updatedAt: "2023-01-01T00:00:00.000Z", // Ngày cập nhật (ISO format)
                     files: [         // Danh sách file trong thư mục con cấp 4
                       {
                         // Cấu trúc giống như files ở trên
                         id: "uuid-string",
                         name: "bai-tap.docx",
                         // ... các thuộc tính khác
                         storage: {
                           provider: "wasabi",
                           key: "courses/course-id/ten-thu-muc/ten-thu-muc-con/ten-file.docx",
                           // ... các thuộc tính khác
                         }
                       }
                     ]
                   }
                 ]
               }
             ]
           }
         ]
       }
     ],
     createdAt: "2023-01-01T00:00:00.000Z", // Ngày tạo nội dung khóa học
     updatedAt: "2023-01-01T00:00:00.000Z"  // Ngày cập nhật nội dung khóa học
   }
   ```

### Nguyên Lý Thiết Kế Hai Collection

#### 1. Lý Do Chia Tách Collection

- **Tách biệt metadata và nội dung chi tiết**:
  - `courses`: Chứa thông tin nhỏ gọn truy vấn thường xuyên (tiêu đề, mô tả, giá...)
  - `courseContents`: Chứa dữ liệu lớn, chi tiết với cấu trúc phân cấp phức tạp

- **Tối ưu hóa hiệu suất truy vấn**:
  - Danh sách khóa học: Chỉ truy vấn collection `courses` (nhẹ, nhanh)
  - Chi tiết khóa học: Mới truy vấn `courseContents` (lớn, phức tạp)

- **Kiểm soát kích thước document**:
  - MongoDB có giới hạn 16MB cho mỗi document
  - Nội dung khóa học có nhiều chapter/lesson/file có thể vượt quá giới hạn
  - Tách biệt giúp quản lý kích thước và tránh lỗi khi khóa học lớn

#### 2. Mối Quan Hệ Giữa Hai Collection

- **Quan hệ 1-1**: Mỗi khóa học trong `courses` tương ứng với một document trong `courseContents`

- **Liên kết thông qua ObjectId**:
  ```javascript
  // Trong collection courses
  {
    _id: ObjectId("6445abc123def456"),
    title: "Tên khóa học",
    // ...
  }
  
  // Trong collection courseContents
  {
    courseId: ObjectId("6445abc123def456"), // Tham chiếu đến _id của courses
    chapters: [...],
    // ...
  }
  ```

#### 3. Quy Trình Hoạt Động

1. **Khi tạo khóa học mới**:
   - Tạo document trong `courses` với metadata cơ bản
   - Tạo document trong `courseContents` với cấu trúc nội dung trống
   - Liên kết hai document thông qua `courseId`

2. **Khi lấy danh sách khóa học**:
   ```javascript
   // API: GET /api/courses
   // Chỉ truy vấn collection courses
   const courses = await findDocuments("courses");
   return courses; // Nhẹ, nhanh
   ```

3. **Khi lấy chi tiết khóa học**:
   ```javascript
   // API: GET /api/courses/:id
   // Cần kết hợp dữ liệu từ cả hai collection
   const course = await findOneDocument("courses", { _id: new ObjectId(courseId) });
   const content = await findOneDocument("courseContents", { courseId: new ObjectId(courseId) });
   
   // Kết hợp dữ liệu để trả về
   return { ...course, chapters: content.chapters };
   ```

4. **Khi cập nhật khóa học**:
   - Cập nhật metadata: Chỉ cập nhật `courses`
   - Cập nhật nội dung: Chỉ cập nhật `courseContents`
   - Đảm bảo tính nhất quán giữa hai collection

5. **Khi xóa khóa học**:
   - Xóa document từ cả hai collection
   ```javascript
   // API: DELETE /api/courses/:id
   await deleteDocument("courses", { _id: new ObjectId(courseId) });
   await deleteDocument("courseContents", { courseId: new ObjectId(courseId) });
   ```

#### 4. Lợi Ích Của Thiết Kế Này

- **Hiệu suất cao**: Truy vấn nhanh hơn khi chỉ cần lấy danh sách khóa học
- **Tiết kiệm tài nguyên**: Giảm lưu lượng mạng và bộ nhớ khi không cần tải toàn bộ nội dung
- **Dễ mở rộng**: Thay đổi cấu trúc nội dung không ảnh hưởng đến metadata
- **Tối ưu cache**: Dễ dàng cache danh sách khóa học mà không phải cache toàn bộ nội dung
- **Phù hợp với truy cập web và mobile**: Web/mobile app chỉ tải thông tin cần thiết

#### 5. Ví Dụ Thực Tế

Khi người dùng truy cập trang danh sách khóa học, hệ thống chỉ cần truy vấn collection `courses` để hiển thị danh sách (tên, hình ảnh, giá...). Khi người dùng click vào một khóa học cụ thể, hệ thống mới truy vấn `courseContents` để tải và hiển thị cấu trúc chi tiết với chapters, lessons, files, và các thư mục con.

### Đường Dẫn Lưu Trữ File trên Wasabi

Hệ thống sử dụng cấu trúc đường dẫn riêng biệt cho mỗi cấp thư mục:

1. **File trong bài học** (cấp 2):
   ```
   courses/${courseId}/${chapterName}/${fileName}
   ```

2. **File trong subfolder** (cấp 3):
   ```
   courses/${courseId}/${chapterName}/${subfolderName}/${fileName}
   ```

3. **File trong subsubfolder** (cấp 4):
   ```
   courses/${courseId}/${chapterName}/${subfolderName}/${subsubfolderName}/${fileName}
   ```

### API Endpoints cho Khóa Học

#### 1. Lấy Danh Sách Khóa Học

```javascript
// GET /api/courses
const fetchCourses = async () => {
  const response = await fetch('/api/courses');
  const data = await response.json();
  
  // Cấu trúc dữ liệu trả về
  // {
  //   data: [
  //     {
  //       id: "course_123",
  //       title: "Toán Thầy Đỗ Văn Đức MAPSTUDY 2K7",
  //       subject: "math",
  //       grade: "grade12",
  //       status: "draft",
  //       price: 100000,
  //       thumbnailUrl: "https://...",
  //       updatedAt: "2023-01-05T00:00:00.000Z"
  //     },
  //     ...
  //   ]
  // }
  
  return data;
};
```

#### 2. Lấy Chi Tiết Khóa Học và Cấu Trúc Nội Dung

```javascript
// GET /api/courses/:id
const fetchCourseDetail = async (courseId) => {
  const response = await fetch(`/api/courses/${courseId}`);
  const { success, course } = await response.json();
  
  // Cấu trúc dữ liệu trả về
  // {
  //   success: true,
  //   course: {
  //     id: "course_123",
  //     title: "Toán Thầy Đỗ Văn Đức MAPSTUDY 2K7",
  //     chapters: [
  //       {
  //         id: "chapter_id",
  //         title: "Chương 1: Đại số",
  //         lessons: [
  //           {
  //             id: "lesson_id",
  //             title: "Bài 1: Hàm số",
  //             files: [...],
  //             subfolders: [
  //               {
  //                 id: "subfolder_id",
  //                 name: "Tài liệu",
  //                 files: [...],
  //                 subfolders: [...]
  //               }
  //             ]
  //           }
  //         ]
  //       }
  //     ]
  //   }
  // }
  
  return course;
};
```

#### 3. Thêm Khóa Học Mới

```javascript
// POST /api/courses
const addCourse = async (courseData) => {
  const response = await fetch('/api/courses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(courseData),
  });
  
  const data = await response.json();
  return data;
};

// Ví dụ courseData
const courseData = {
  title: "Toán Thầy Đỗ Văn Đức MAPSTUDY 2K7",
  subject: "math", // Hoặc để trống, hệ thống sẽ tự phát hiện từ tiêu đề
  grade: "grade12", // Hoặc để trống, hệ thống sẽ tự phát hiện từ tiêu đề
  driveUrl: "https://drive.google.com/drive/folders/...",
  price: 100000,
  description: "Mô tả khóa học...",
};
```

#### 4. Cập Nhật Khóa Học

```javascript
// PUT /api/courses/:id
const updateCourse = async (courseId, courseData) => {
  const response = await fetch(`/api/courses/${courseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(courseData),
  });
  
  const data = await response.json();
  return data;
};
```

#### 5. Xóa Khóa Học

```javascript
// DELETE /api/courses/:id
const deleteCourse = async (courseId) => {
  const response = await fetch(`/api/courses/${courseId}`, {
    method: 'DELETE',
  });
  
  const data = await response.json();
  return data;
};
```

### Tính Năng Phát Hiện Môn Học và Lớp

Hệ thống tự động phát hiện `subject` (môn học) và `grade` (lớp) dựa vào tiêu đề khóa học:

```javascript
// Ví dụ hàm detectSubjectFromTitle
function detectSubjectFromTitle(title) {
  const lowerTitle = title.toLowerCase();
  
  // Phát hiện môn Toán
  if (lowerTitle.includes('toán') || 
      lowerTitle.includes('math') || 
      lowerTitle.includes('đại số') ||
      lowerTitle.includes('hình học') ||
      lowerTitle.includes('do van duc') ||
      lowerTitle.includes('do duc')) {
    return 'math';
  }
  
  // Phát hiện môn Lý
  if (lowerTitle.includes('lý') || 
      lowerTitle.includes('vật lý') ||
      lowerTitle.includes('physics')) {
    return 'physics';
  }
  
  // Các môn khác...
  
  // Mặc định
  return 'other';
}

// Ví dụ hàm detectGradeFromTitle
function detectGradeFromTitle(title) {
  const lowerTitle = title.toLowerCase();
  
  // Phát hiện lớp 12
  if (lowerTitle.includes('lớp 12') || 
      lowerTitle.includes('grade 12') || 
      lowerTitle.includes('12 cơ bản') ||
      lowerTitle.includes('2k5') ||
      lowerTitle.includes('2k6')) {
    return 'grade12';
  }
  
  // Các lớp khác...
  
  // Mặc định
  return 'grade10';
}
```

### Ví Dụ Tương Tác Hoàn Chỉnh

```javascript
// Lấy danh sách khóa học và lọc theo môn học
const getCoursesBySubject = async (subject) => {
  const response = await fetch('/api/courses');
  const data = await response.json();
  
  // Lọc theo môn học
  const filteredCourses = data.data.filter(course => course.subject === subject);
  
  return filteredCourses;
};

// Thêm khóa học mới và đồng bộ từ Google Drive
const addCourseAndSync = async (courseData) => {
  // Thêm khóa học
  const course = await addCourse(courseData);
  
  // Đồng bộ từ Google Drive
  const syncResponse = await fetch(`/api/courses/${course.id}/sync`, {
    method: 'POST',
  });
  
  return syncResponse.json();
};

// Kiểm tra xem khóa học đã có nội dung chưa
const checkCourseHasContent = async (courseId) => {
  const response = await fetch(`/api/courses/${courseId}`);
  const data = await response.json();
  
  // Kiểm tra số lượng chương và bài học
  const hasContent = data.course.chaptersCount > 0 && data.course.lessonsCount > 0;
  
  return hasContent;
};
```

## API Upload Video

### Upload Video từ Google Drive lên Helvid

Hệ thống hỗ trợ hai phương thức upload video lên Helvid:

1. **Upload bằng URL (Khuyến nghị)**: Upload trực tiếp từ URL Google Drive lên Helvid mà không cần tải về máy chủ trung gian.
   - Ưu điểm: Không bị lỗi 413 (Request Entity Too Large), xử lý được file lớn
   - API: `/api/upload-to-helvid` hoặc `/api/helvid-uploader`

```javascript
// Ví dụ request sử dụng upload-to-helvid
const response = await fetch("/api/upload-to-helvid", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    videoUrl: "https://drive.google.com/file/d/YOUR_FILE_ID/view",
    useAlternativeMethod: true, // Quan trọng: Đặt true để sử dụng phương thức upload bằng URL
  }),
});

// HOẶC sử dụng trực tiếp helvid-uploader (Khuyến nghị)
const response = await fetch("/api/helvid-uploader", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    driveUrl: "https://drive.google.com/file/d/YOUR_FILE_ID/view",
  }),
});

const result = await response.json();
// result.data.videoUrl chứa URL của video đã upload
```

2. **Upload thông thường**: Tải file về máy chủ trung gian rồi upload lên Helvid.
   - Hạn chế: Có thể gặp lỗi 413 với file lớn
   - API: `/api/upload-to-helvid`

```javascript
// Ví dụ request
const response = await fetch("/api/upload-to-helvid", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    videoUrl: "https://drive.google.com/file/d/YOUR_FILE_ID/view",
    useAlternativeMethod: false, // Sử dụng phương thức thông thường
  }),
});

const result = await response.json();
```

### Upload Nhiều Video Cùng Lúc

API `helvid-uploader` hỗ trợ upload nhiều video cùng lúc:

```javascript
const response = await fetch("/api/helvid-uploader", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    driveUrls: [
      "https://drive.google.com/file/d/FILE_ID_1/view",
      "https://drive.google.com/file/d/FILE_ID_2/view",
      "https://drive.google.com/file/d/FILE_ID_3/view",
    ],
  }),
});

const result = await response.json();
// result.results chứa kết quả upload của từng video
```

### Lấy Danh Sách Video

API `helvid-uploader` hỗ trợ lấy danh sách video đã upload:

```javascript
const response = await fetch("/api/helvid-uploader", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    action: "getMyVideos",
    options: {
      apikey: "F3ziE0vwcNP2W57i6j1bdk4QjbwNX", // Tùy chọn, mặc định sẽ dùng API key đã cấu hình
      page: 1, // Trang hiện tại
      per_page: 20, // Số video mỗi trang
      search: "tên video", // Tìm kiếm theo tên (tùy chọn)
      cid: "15", // Video class ID
      mycid: "17", // Private class
      fid: "18", // Server ID
      sort_field: "addtime", // Sắp xếp theo trường (id, name, hits, duration, addtime)
      sort_by: "desc", // Thứ tự sắp xếp (asc, desc)
    },
  }),
});

const result = await response.json();
// result.data.data chứa danh sách video
// result.data.total_page chứa tổng số trang
// result.data.total_item chứa tổng số video
```

### Import Khóa Học từ Google Drive

API này sẽ tự động import toàn bộ cấu trúc thư mục từ Google Drive và upload video lên Helvid:

```javascript
// Ví dụ request
const response = await fetch("/api/import-course-from-drive", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    driveUrl: "https://drive.google.com/drive/folders/YOUR_FOLDER_ID",
  }),
});

const result = await response.json();
```

## Trang Test

Dự án cung cấp các trang test để kiểm tra các API:

1. **Test Helvid Uploader**: http://localhost:3000/test-helvid

   - Giao diện đầy đủ để test tất cả các chức năng
   - Hỗ trợ upload video, xem danh sách video

2. **Test Upload**: http://localhost:3000/api/test-upload
   - Giao diện đơn giản để test upload video

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

## Quy Trình Import Khóa Học từ Google Drive

1. **Quá trình import** hoạt động theo các bước:

   - **Bước 1**: Lấy thông tin thư mục từ Google Drive
     - Sử dụng Drive API để lấy thông tin thư mục gốc và cấu trúc thư mục con
   
   - **Bước 2**: Tạo hoặc cập nhật khóa học trong MongoDB
     - Tạo record trong collection `courses` với thông tin cơ bản
   
   - **Bước 3**: Phân tích cấu trúc thư mục và tạo chương/bài học
     - Phân tích cấu trúc thư mục và ánh xạ vào mô hình dữ liệu 4 cấp
     - Thư mục cấp 1 -> Chương (chapters)
     - Thư mục cấp 2 -> Bài học (lessons)
     - Thư mục cấp 3 -> Thư mục con (subfolders)
     - Thư mục cấp 4 -> Thư mục con của thư mục con (subsubfolders)
   
   - **Bước 4**: Tải và lưu trữ các file
     - Tải file từ Google Drive
     - Upload lên Wasabi lưu trữ
     - Cập nhật thông tin file trong MongoDB
   
   - **Bước 5**: Đồng bộ hóa và xóa các mục không còn tồn tại
     - Kiểm tra và xóa các mục đã bị xóa từ Google Drive
     - Cập nhật trạng thái đồng bộ

2. **API Import Khóa Học**:

```javascript
// POST /api/import-course-from-drive
const importCourse = async (driveUrl) => {
  const response = await fetch('/api/import-course-from-drive', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      driveUrl: "https://drive.google.com/drive/folders/YOUR_FOLDER_ID",
      enableSync: true, // Bật đồng bộ xóa
    }),
  });
  
  const result = await response.json();
  // result chứa thông tin về quá trình import và courseId
  
  return result;
};
```

### Ví Dụ Truy Xuất và Hiển Thị Dữ Liệu trong Frontend

```javascript
// Lấy và hiển thị danh sách khóa học
async function displayCourseList() {
  const response = await fetch('/api/courses');
  const { data: courses } = await response.json();
  
  const courseList = document.getElementById('course-list');
  courses.forEach(course => {
    const courseItem = document.createElement('div');
    courseItem.innerHTML = `
      <h3>${course.title}</h3>
      <p>Môn học: ${course.subject}</p>
      <p>Cập nhật: ${new Date(course.updatedAt).toLocaleDateString()}</p>
      <button onclick="viewCourseDetail('${course.id}')">Xem chi tiết</button>
    `;
    courseList.appendChild(courseItem);
  });
}

// Lấy và hiển thị chi tiết khóa học
async function viewCourseDetail(courseId) {
  const response = await fetch(`/api/courses/${courseId}`);
  const { course } = await response.json();
  
  const courseDetail = document.getElementById('course-detail');
  courseDetail.innerHTML = `
    <h2>${course.title}</h2>
    <p>${course.description}</p>
    
    <div class="chapters">
      ${course.chapters.map(chapter => `
        <div class="chapter">
          <h3>${chapter.title}</h3>
          <div class="lessons">
            ${chapter.lessons.map(lesson => `
              <div class="lesson">
                <h4>${lesson.title}</h4>
                <div class="files">
                  ${lesson.files.map(file => `
                    <div class="file">
                      <span>${file.name}</span>
                      <a href="/api/file/${file.id}" target="_blank">Xem</a>
                    </div>
                  `).join('')}
                </div>
                <div class="subfolders">
                  ${lesson.subfolders.map(subfolder => `
                    <div class="subfolder">
                      <h5>${subfolder.name}</h5>
                      <div class="files">
                        ${subfolder.files.map(file => `
                          <div class="file">
                            <span>${file.name}</span>
                            <a href="/api/file/${file.id}" target="_blank">Xem</a>
                          </div>
                        `).join('')}
                      </div>
                      <div class="subsubfolders">
                        ${subfolder.subfolders.map(subsubfolder => `
                          <div class="subsubfolder">
                            <h6>${subsubfolder.name}</h6>
                            <div class="files">
                              ${subsubfolder.files.map(file => `
                                <div class="file">
                                  <span>${file.name}</span>
                                  <a href="/api/file/${file.id}" target="_blank">Xem</a>
                                </div>
                              `).join('')}
                            </div>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Gọi hàm hiển thị danh sách khóa học khi trang được load
document.addEventListener('DOMContentLoaded', displayCourseList);
```
#   a d m i n 
 
 
