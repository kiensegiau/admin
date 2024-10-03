import { NextResponse } from "next/server";
import B2 from "backblaze-b2";

export async function POST(req) {
  try {
    const { bucketId } = await req.json();

    const b2 = new B2({
      applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
      applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
    });

    await b2.authorize();
    const response = await b2.getUploadUrl({ bucketId });

    return NextResponse.json(response.data);
  } catch (error) {
    console.error("Lỗi khi lấy URL tải lên B2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
