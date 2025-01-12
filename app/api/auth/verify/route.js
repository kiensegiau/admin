import { NextResponse } from "next/server";
import { auth } from "@/lib/firebase-admin";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const cookieStore = cookies();
    const session = cookieStore.get("session")?.value;

    if (!session) {
      return NextResponse.json({ error: "No session found" }, { status: 401 });
    }

    const decodedClaims = await auth.verifySessionCookie(session, true);
    return NextResponse.json({ 
      email: decodedClaims.email,
      uid: decodedClaims.uid 
    });
  } catch (error) {
    console.error("Lỗi verify session:", error);
    return NextResponse.json(
      { error: "Invalid session" }, 
      { status: 401 }
    );
  }
} 