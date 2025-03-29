export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function POST(request) {
  try {
    const { courseIds, price, teacher, subject, grade } = await request.json();

    // Kiểm tra xem có danh sách ID khóa học không
    if (!courseIds || !Array.isArray(courseIds) || courseIds.length === 0) {
      return NextResponse.json(
        { error: "Vui lòng chọn ít nhất một khóa học để cập nhật" },
        { status: 400 }
      );
    }

    // Kiểm tra xem có ít nhất một thông tin cần cập nhật không
    if (price === undefined && teacher === undefined && subject === undefined && grade === undefined) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp ít nhất một thông tin để cập nhật" },
        { status: 400 }
      );
    }

    // Khởi tạo đối tượng chứa thông tin cần cập nhật
    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    // Thêm giá nếu có
    if (price !== undefined && price !== null) {
      updateData.price = Number(price);
    }

    // Thêm thông tin giáo viên nếu có
    if (teacher !== undefined && teacher !== null) {
      updateData.teacher = teacher;
    }
    
    // Thêm thông tin môn học nếu có
    if (subject !== undefined && subject !== null) {
      updateData.subject = subject;
    }
    
    // Thêm thông tin lớp nếu có
    if (grade !== undefined && grade !== null) {
      updateData.grade = grade;
    }

    // Tạo batch để cập nhật nhiều document cùng lúc
    const batch = db.batch();

    // Thêm mỗi document vào batch
    for (const courseId of courseIds) {
      const courseRef = db.collection("courses").doc(courseId);
      batch.update(courseRef, updateData);
    }

    // Thực hiện cập nhật hàng loạt
    await batch.commit();

    console.log(`Đã cập nhật ${courseIds.length} khóa học`);

    return NextResponse.json({
      success: true,
      updatedCount: courseIds.length,
      message: `Đã cập nhật ${courseIds.length} khóa học thành công`
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật hàng loạt:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật hàng loạt: " + error.message },
      { status: 500 }
    );
  }
} 