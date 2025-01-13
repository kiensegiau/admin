export const dynamic = 'force-dynamic';

import { NextResponse } from "next/server"; import { readTokens } from "@/lib/tokenStorage";  const TOKEN_EXPIRY_THRESHOLD = 5 * 60 * 1000; // 5 phút  export async function GET() {   try {     const tokens = readTokens();     if (!tokens) {       return NextResponse.json(         { error: "Không tìm thấy token" },         { status: 401 }       );     }      const now = Date.now();     const expiryDate = new Date(tokens.expiry_date).getTime();     const timeUntilExpiry = expiryDate - now;      return NextResponse.json({       shouldRefresh: timeUntilExpiry < TOKEN_EXPIRY_THRESHOLD,       expiresIn: timeUntilExpiry,     });   } catch (error) {     console.error("Lỗi kiểm tra token Drive:", error);     return NextResponse.json(       { error: "Không thể kiểm tra token" },       { status: 500 }     );   } }
