export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server"; 
import { ObjectId, updateDocument } from "@/lib/db";  

export async function POST(request) {   
  try {     
    const { courseId, price, teacher, subject, grade } = await request.json();      
    
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
    
    if (subject !== undefined) {
      courseData.$set.subject = subject;
    }
    
    if (grade !== undefined) {
      courseData.$set.grade = grade;
    }
    
    console.log("Dữ liệu cập nhật:", courseData);
    
    // Cập nhật khóa học trong MongoDB
    const result = await updateDocument(
      "courses", 
      { _id: new ObjectId(courseId) },
      courseData
    );
    
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
