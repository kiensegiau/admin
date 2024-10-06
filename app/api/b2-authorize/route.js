import { NextResponse } from "next/server";
import B2 from "backblaze-b2";

export async function GET(req) {
  try {
    const b2 = new B2({
      applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
      applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
    });

    await b2.authorize();
    
    return NextResponse.json({ authorized: true });
  } catch (error) {
    console.error("Lỗi khi xác thực B2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}