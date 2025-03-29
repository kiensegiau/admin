export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server"; 
import { db } from "@/lib/firebase-admin";  

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
      updatedAt: new Date().toISOString()
    };
    
    // Chỉ thêm các trường có dữ liệu
    if (price !== undefined) {
      courseData.price = Number(price);
    }
    
    if (teacher !== undefined) {
      courseData.teacher = teacher;
    }
    
    if (subject !== undefined) {
      courseData.subject = subject;
    }
    
    if (grade !== undefined) {
      courseData.grade = grade;
    }
    
    console.log("Dữ liệu cập nhật:", courseData);
    
    if (!db) {       
      throw new Error("Firestore chưa được khởi tạo");     
    }      
    
    await db.collection("courses").doc(courseId).update(courseData);     
    return NextResponse.json({ success: true });   
  } catch (error) {     
    console.error("Error updating course:", error);     
    return NextResponse.json(       
      { error: "Không thể cập nhật khóa học: " + error.message },       
      { status: 500 }     
    );   
  } 
}
