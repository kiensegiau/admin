export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server";

/**
 * API cũ sử dụng Firebase đã được thay thế bằng API mới /api/courses/create
 * API mới sử dụng MongoDB và có kiểm tra trùng lặp
 */
export async function POST(request) {
  try {
    // Đọc dữ liệu từ request
    const courseData = await request.json();

    // Chuyển tiếp request đến API mới
    const response = await fetch(new URL('/api/courses/create', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(courseData),
    });

    // Trả về kết quả từ API mới
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Lỗi khi chuyển tiếp request:", error);
    return NextResponse.json(
      { error: "Không thể thêm khóa học: " + error.message },
      { status: 500 }
    );
  }
}
