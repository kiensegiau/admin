export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");

    if (!fileId) {
      return NextResponse.json(
        { error: "File ID is required" },
        { status: 400 }
      );
    }

    // Tạo URL trực tiếp từ Google Drive
    const driveUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

    // Fetch nội dung file từ Google Drive
    const response = await fetch(driveUrl);
    const contentType = response.headers.get("content-type");

    // Stream response về client
    return new NextResponse(response.body, {
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy file" },
      { status: 500 }
    );
  }
}
