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

    // Tìm thông tin người dùng (hỗ trợ nhiều loại ID)
    let user;
    
    // Log để debug
    console.log("Đang tìm người dùng với ID:", userId);
    
    // Thử với ObjectId MongoDB
    if (/^[0-9a-fA-F]{24}$/.test(userId)) {
      console.log("Tìm theo MongoDB ObjectId");
      user = await findOneDocument("users", { _id: new ObjectId(userId) });
    }
    
    // Nếu không tìm thấy, thử với firebaseId
    if (!user) {
      console.log("Tìm theo firebaseId");
      user = await findOneDocument("users", { firebaseId: userId });
    }
    
    // Nếu không tìm thấy, thử với uid
    if (!user) {
      console.log("Tìm theo uid");
      user = await findOneDocument("users", { uid: userId });
    }
    
    // Nếu không tìm thấy, thử với id thông thường
    if (!user) {
      console.log("Tìm theo id thông thường");
      user = await findOneDocument("users", { id: userId });
    }
    
    // Cuối cùng, kiểm tra lại
    if (!user) {
      console.error("Không tìm thấy người dùng với ID:", userId);
      return NextResponse.json(
        { error: "Không tìm thấy thông tin người dùng với ID " + userId },
        { status: 404 }
      );
    }
    
    console.log("Đã tìm thấy người dùng:", {
      _id: user._id?.toString(),
      email: user.email,
      fullName: user.fullName
    });

    // Tìm hoặc tạo thông tin tài chính của người dùng
    let userFinance = await findOneDocument("userFinances", { 
      userId: user._id 
    });

    if (!userFinance) {
      // Nếu không tìm thấy, tạo mới thông tin tài chính
      console.log("Không tìm thấy thông tin tài chính, tạo mới cho:", user._id.toString());
      await insertDocument("userFinances", {
        userId: user._id,
        balance: 0,
        totalDeposit: 0,
        totalWithdraw: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      userFinance = await findOneDocument("userFinances", { userId: user._id });
      
      if (!userFinance) {
        return NextResponse.json(
          { error: "Không thể tạo thông tin tài chính cho người dùng" },
          { status: 500 }
        );
      }
    }

    const currentBalance = userFinance.balance || 0;
    const newBalance = currentBalance + amount;
    const totalDeposit = (userFinance.totalDeposit || 0) + amount;

    // Cập nhật thông tin tài chính
    await updateDocument(
      "userFinances", 
      { userId: user._id }, 
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
      userId: user._id,
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

    // Cập nhật balance trong bảng users nếu có trường này
    try {
      await updateDocument(
        "users",
        { _id: user._id },
        {
          $set: {
            balance: newBalance,
            updatedAt: new Date()
          }
        }
      );
    } catch (updateError) {
      console.error("Lỗi khi cập nhật balance trong bảng users:", updateError);
      // Không throw, vì đây chỉ là cập nhật phụ
    }

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
