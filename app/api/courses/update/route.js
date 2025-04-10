export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server"; 
import { ObjectId, updateDocument } from "@/lib/db";  

export async function POST(request) {   
  try {     
    const requestData = await request.json();
    const { courseId, price, teacher, subject, grade } = requestData;
    
    console.log("Dữ liệu API nhận được:", JSON.stringify(requestData, null, 2));
    console.log("Grade:", grade, "Kiểu:", typeof grade);
    console.log("Subject:", subject, "Kiểu:", typeof subject);
    
    if (!courseId) {       
      return NextResponse.json(         
        { error: "Vui lòng chọn khóa học để cập nhật" },         
        { status: 400 }       
      );     
    }      
    
    // Tạo đối tượng dữ liệu cập nhật
    const courseData = {
      $set: {
        updatedAt: new Date()
      }
    };
    
    // Chỉ thêm các trường có dữ liệu
    if (price !== undefined) {
      courseData.$set.price = Number(price);
    }
    
    if (teacher !== undefined) {
      courseData.$set.teacher = teacher;
    }
    
    if (subject !== undefined && subject !== null) {
      courseData.$set.subject = subject;
      console.log("Lưu subject:", subject);
    }
    
    if (grade !== undefined && grade !== null) {
      courseData.$set.grade = grade;
      console.log("Lưu grade:", grade);
    }
    
    console.log("Dữ liệu cập nhật:", JSON.stringify(courseData, null, 2));
    
    // Cập nhật khóa học trong MongoDB
    const result = await updateDocument(
      "courses", 
      { _id: new ObjectId(courseId) },
      courseData
    );
    
    console.log("Kết quả MongoDB:", result);
    
    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { error: "Không tìm thấy khóa học hoặc không có thay đổi" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true,
      message: "Cập nhật khóa học thành công" 
    });   
  } catch (error) {     
    console.error("Error updating course:", error);     
    return NextResponse.json(       
      { error: "Không thể cập nhật khóa học: " + error.message },       
      { status: 500 }     
    );   
  } 
}
