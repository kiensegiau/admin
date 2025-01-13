export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";

export async function GET(request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Token không hợp lệ" },
        { status: 401 }
      );
    }

    const idToken = authHeader.split("Bearer ")[1];
    await auth.verifyIdToken(idToken);

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Lỗi xác thực token:", error);
    return NextResponse.json({ error: "Token không hợp lệ" }, { status: 401 });
  }
}
