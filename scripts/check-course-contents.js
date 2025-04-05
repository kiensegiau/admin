/**
 * Script kiểm tra dữ liệu courseContents trong MongoDB
 */

const db = require('./cjs-db');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Tải biến môi trường
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Thêm MONGODB_URI trực tiếp nếu không có trong môi trường
if (!process.env.MONGODB_URI) {
  process.env.MONGODB_URI = "mongodb+srv://hocmaiadmin:adminpass123@cluster0.qcbzwek.mongodb.net/hocmai?retryWrites=true&w=majority&appName=Cluster0";
}

async function checkCourseContents() {
  try {
    // Kết nối đến MongoDB
    await db.connectToDatabase();
    console.log('Đã kết nối thành công đến MongoDB');
    
    // Đếm số lượng trong collections
    const coursesCount = await db.findDocuments('courses');
    console.log(`Số lượng khóa học trong collection courses: ${coursesCount.length}`);
    
    const courseContentsCount = await db.findDocuments('courseContents');
    console.log(`Số lượng khóa học trong collection courseContents: ${courseContentsCount.length}`);
    
    // Hiển thị ví dụ một courseContent
    if (courseContentsCount.length > 0) {
      const firstContent = courseContentsCount[0];
      console.log('\nVí dụ dữ liệu courseContent:');
      console.log('- CourseId:', firstContent.courseId.toString());
      console.log('- Số sections:', firstContent.sections?.length || 0);
      console.log('- Tổng số bài học:', firstContent.totalLessons || 0);
      
      // Hiển thị thông tin về section đầu tiên nếu có
      if (firstContent.sections && firstContent.sections.length > 0) {
        const firstSection = firstContent.sections[0];
        console.log('\nThông tin section đầu tiên:');
        console.log('- Tiêu đề:', firstSection.title);
        console.log('- Số bài học:', firstSection.lessons?.length || 0);
        
        // Hiển thị thông tin về bài học đầu tiên nếu có
        if (firstSection.lessons && firstSection.lessons.length > 0) {
          const firstLesson = firstSection.lessons[0];
          console.log('\nThông tin bài học đầu tiên:');
          console.log('- Tiêu đề:', firstLesson.title);
          console.log('- Loại:', firstLesson.type);
          console.log('- Mô tả:', firstLesson.description?.substring(0, 100) || 'Không có mô tả');
          console.log('- Nội dung:', firstLesson.content?.substring(0, 100) || 'Không có nội dung');
          console.log('- Thứ tự:', firstLesson.order);
          console.log('- Là bài xem trước:', firstLesson.isPreview ? 'Có' : 'Không');
          
          if (firstLesson.metadata) {
            console.log('- Metadata:', JSON.stringify(firstLesson.metadata, null, 2));
          }
        }
      }
      
      // Lưu dữ liệu chi tiết vào file
      fs.writeFileSync('course-content-example.json', JSON.stringify(firstContent, null, 2));
      console.log('\nĐã lưu dữ liệu chi tiết vào file course-content-example.json');
    } else {
      console.log('\nKhông tìm thấy dữ liệu trong collection courseContents');
    }
    
    // Lấy thông tin course tương ứng
    if (courseContentsCount.length > 0) {
      const firstContent = courseContentsCount[0];
      const courseId = firstContent.courseId;
      const course = await db.findOneDocument('courses', { _id: courseId });
      
      if (course) {
        console.log('\nThông tin khóa học tương ứng:');
        console.log('- Tiêu đề:', course.title);
        console.log('- Slug:', course.slug);
        console.log('- Mô tả ngắn:', course.shortDescription || 'Không có');
      }
    }
    
  } catch (error) {
    console.error('Lỗi khi kiểm tra dữ liệu courseContents:', error);
  }
}

// Chạy kiểm tra
checkCourseContents()
  .then(() => {
    console.log('\nHoàn thành kiểm tra courseContents');
    process.exit(0);
  })
  .catch(error => {
    console.error('Lỗi không xác định:', error);
    process.exit(1);
  }); 