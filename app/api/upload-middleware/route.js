import { NextResponse } from "next/server";
import FormData from "form-data";
import axios from "axios";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const newFormData = new FormData();

    // Chuyển đổi FormData từ request sang FormData mới
    for (let [key, value] of formData.entries()) {
      newFormData.append(key, value);
    }

    // Gửi request đến API xử lý chính
    const response = await axios.post('http://localhost:3000/api/upload-and-segment-video', newFormData, {
      headers: {
        ...newFormData.getHeaders(),
      },
    });

    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Lỗi trong quá trình xử lý:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
