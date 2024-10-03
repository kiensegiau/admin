import { NextResponse } from "next/server";
import fetch from "node-fetch";

export async function POST(req) {
  const formData = await req.formData();
  const file = formData.get("file");
  const fileName = formData.get("fileName");
  const uploadUrl = formData.get("uploadUrl");
  const authorizationToken = formData.get("authorizationToken");

  if (!file || !fileName || !uploadUrl || !authorizationToken) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const fileInfo = await response.json();
    return NextResponse.json(fileInfo);
  } catch (error) {
    console.error("Lỗi khi tải file lên B2:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
