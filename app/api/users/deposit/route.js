import { db } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { userId, amount } = await request.json();

    if (!userId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    const userRef = db.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: "Không tìm thấy người dùng" },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    const currentBalance = userData.balance || 0;
    const newBalance = currentBalance + amount;

    // Cập nhật số dư mới
    await userRef.update({
      balance: newBalance,
      updatedAt: new Date().toISOString(),
    });

    // Lưu lịch sử giao dịch
    await db.collection("transactions").add({
      userId,
      type: "deposit",
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      createdAt: new Date().toISOString(),
      status: "completed",
      description: "Nạp tiền vào tài khoản",
    });

    return NextResponse.json({
      success: true,
      balance: newBalance,
    });
  } catch (error) {
    console.error("Lỗi khi nạp tiền:", error);
    return NextResponse.json(
      { error: "Không thể thực hiện nạp tiền" },
      { status: 500 }
    );
  }
}
