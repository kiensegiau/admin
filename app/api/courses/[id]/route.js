import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { findOneDocument } from "@/lib/db";
import { CourseAdapter } from "@/lib/adapters/course-adapter";

export async function GET(request, { params }) {
  try {
    const courseId = params.id;
    console.log("\n=== Bắt đầu lấy thông tin khóa học ===");
    console.log("CourseID:", courseId);

    if (!courseId) {
      console.log("Lỗi: Thiếu ID khóa học");
      return NextResponse.json({ error: "Thiếu ID khóa học" }, { status: 400 });
    }

    // Sử dụng CourseAdapter để lấy dữ liệu theo cấu trúc cũ (tương thích)
    const formattedCourse = await CourseAdapter.toLegacyStructure(courseId);

    if (!formattedCourse) {
      console.log("Lỗi: Không tìm thấy khóa học với ID", courseId);
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    console.log("Formatted course:", JSON.stringify(formattedCourse, null, 2));
    console.log("=== Kết thúc lấy thông tin khóa học ===\n");

    return NextResponse.json({
      success: true,
      course: formattedCourse,
    });
  } catch (error) {
    console.error("Lỗi chi tiết khi lấy thông tin khóa học:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi lấy thông tin khóa học",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request, { params }) {
  try {
    const courseId = params.id;
    const data = await request.json();

    if (!courseId) {
      return NextResponse.json({ error: "Thiếu ID khóa học" }, { status: 400 });
    }

    // Kiểm tra khóa học có tồn tại không
    const course = await findOneDocument("courses", { _id: new ObjectId(courseId) });
    if (!course) {
      return NextResponse.json(
        { error: "Không tìm thấy khóa học" },
        { status: 404 }
      );
    }

    // Cập nhật thông tin cơ bản của khóa học
    const updateData = {
      ...data,
      updatedAt: new Date()
    };

    // Cập nhật trong MongoDB
    await fetch(`/api/mongodb?collection=courses&id=${courseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateData)
    });

    return NextResponse.json({
      success: true,
      message: "Đã cập nhật khóa học thành công"
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật khóa học:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi cập nhật khóa học"
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const courseId = params.id;

    if (!courseId) {
      return NextResponse.json({ error: "Thiếu ID khóa học" }, { status: 400 });
    }

    // Xóa cả bản ghi trong collections courses và courseContents
    await fetch(`/api/mongodb?collection=courses&id=${courseId}`, {
      method: "DELETE"
    });
    
    await fetch(`/api/mongodb?collection=courseContents&query=${encodeURIComponent(JSON.stringify({ courseId: new ObjectId(courseId) }))}`, {
      method: "DELETE"
    });

    return NextResponse.json({
      success: true,
      message: "Đã xóa khóa học thành công"
    });
  } catch (error) {
    console.error("Lỗi khi xóa khóa học:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Có lỗi xảy ra khi xóa khóa học"
      },
      { status: 500 }
    );
  }
}
