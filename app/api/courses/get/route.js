export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";

export async function GET() {
  try {
    console.log("Bắt đầu lấy danh sách khóa học");
    const coursesRef = db.collection("courses");
    const snapshot = await coursesRef.get();

    const courses = [];
    snapshot.forEach((doc) => {
      courses.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return NextResponse.json({ courses });
  } catch (error) {
    console.error("Error getting course:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
