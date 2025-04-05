export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { findOneDocument, updateDocument, insertDocument } from "@/lib/db";
import { ObjectId } from 'mongodb';

export async function POST(request) {
  try {
    const { userId, amount } = await request.json();

    if (!userId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: "Dữ liệu không hợp lệ" },
        { status: 400 }
      );
    }

    // Tìm thông tin tài chính của người dùng
    const userFinance = await findOneDocument("userFinances", { 
      userId: new ObjectId(userId) 
    });

    if (!userFinance) {
      return NextResponse.json(
        { error: "Không tìm thấy thông tin tài chính của người dùng" },
        { status: 404 }
      );
    }

    const currentBalance = userFinance.balance || 0;
    const newBalance = currentBalance + amount;
    const totalDeposit = (userFinance.totalDeposit || 0) + amount;

    // Cập nhật thông tin tài chính
    await updateDocument(
      "userFinances", 
      { userId: new ObjectId(userId) }, 
      { 
        $set: {
          balance: newBalance,
          totalDeposit: totalDeposit,
          updatedAt: new Date()
        }
      }
    );

    // Lưu lịch sử giao dịch
    await insertDocument("transactions", {
      userId: new ObjectId(userId),
      type: "deposit",
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      status: "completed",
      description: "Nạp tiền vào tài khoản",
      metadata: {
        // Thêm metadata nếu cần
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      balance: newBalance,
      totalDeposit: totalDeposit,
    });
  } catch (error) {
    console.error("Lỗi khi nạp tiền:", error);
    return NextResponse.json(
      { error: "Không thể thực hiện nạp tiền: " + error.message },
      { status: 500 }
    );
  }
}
