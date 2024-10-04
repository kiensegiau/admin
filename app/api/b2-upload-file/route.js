import { NextResponse } from "next/server";
import fetch from "node-fetch";

export async function POST(req) {
  const formData = await req.formData();
  const [file, fileName, uploadUrl, authorizationToken] = ['file', 'fileName', 'uploadUrl', 'authorizationToken'].map(key => formData.get(key));

  if (!file || !fileName || !uploadUrl || !authorizationToken) {
    return NextResponse.json({ error: "Thiếu các trường bắt buộc" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: authorizationToken,
        "X-Bz-File-Name": encodeURIComponent(fileName),
        "Content-Type": file.type,
        "X-Bz-Content-Sha1": "do_not_verify",
      },
      body: buffer,
    });

    if (!response.ok) {
      throw new Error(`Lỗi HTTP! Trạng thái: ${response.status}`);
    }

    return NextResponse.json(await response.json());
  } catch (error) {
    console.error("Lỗi khi tải file lên B2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
