export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";
import { ObjectId, updateDocuments } from "@/lib/db";

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
      $set: {
        updatedAt: new Date()
      }
    };

    // Thêm giá nếu có
    if (price !== undefined && price !== null) {
      updateData.$set.price = Number(price);
    }

    // Thêm thông tin giáo viên nếu có
    if (teacher !== undefined && teacher !== null) {
      updateData.$set.teacher = teacher;
    }
    
    // Thêm thông tin môn học nếu có
    if (subject !== undefined && subject !== null) {
      updateData.$set.subject = subject;
    }
    
    // Thêm thông tin lớp nếu có
    if (grade !== undefined && grade !== null) {
      updateData.$set.grade = grade;
    }

    // Chuyển đổi danh sách ID thành mảng ObjectId
    const courseObjectIds = courseIds.map(id => new ObjectId(id));

    // Thực hiện cập nhật hàng loạt trong MongoDB
    const result = await updateDocuments(
      "courses",
      { _id: { $in: courseObjectIds } },
      updateData
    );

    console.log(`Đã cập nhật ${result.modifiedCount} khóa học`);

    return NextResponse.json({
      success: true,
      updatedCount: result.modifiedCount,
      message: `Đã cập nhật ${result.modifiedCount} khóa học thành công`
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật hàng loạt:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật hàng loạt: " + error.message },
      { status: 500 }
    );
  }
} 