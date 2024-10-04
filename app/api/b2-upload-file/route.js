import { NextResponse } from "next/server";
import fetch from "node-fetch";

export async function POST(req) {
  console.log('Bắt đầu xử lý yêu cầu upload file lên B2');
  const formData = await req.formData();
  const [file, fileName, uploadUrl, authorizationToken] = ['file', 'fileName', 'uploadUrl', 'authorizationToken'].map(key => formData.get(key));

  if (!file || !fileName || !uploadUrl || !authorizationToken) {
    console.error('Thiếu các trường bắt buộc');
    return NextResponse.json({ error: "Thiếu các trường bắt buộc" }, { status: 400 });
  }

  try {
    console.log(`Đang upload file: ${fileName}`);
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
      console.error(`Lỗi HTTP khi upload file ${fileName}. Trạng thái: ${response.status}`);
      throw new Error(`Lỗi HTTP! Trạng thái: ${response.status}`);
    }

    console.log(`Upload thành công file: ${fileName}`);
    return NextResponse.json(await response.json());
  } catch (error) {
    console.error("Lỗi khi tải file lên B2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
