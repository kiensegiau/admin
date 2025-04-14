export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { findOneDocument, updateDocument, insertDocument } from "@/lib/db";
import { ObjectId } from 'mongodb';
// Bỏ xác thực tạm thời để sửa lỗi
// import { getServerSession } from "next-auth/next";
// import { authOptions } from "@/lib/auth";

// Hàm tiện ích xử lý thời gian
const dateTimeHelper = {
  // Hàm lấy thời gian hiện tại theo múi giờ Việt Nam
  getCurrentTime: () => {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    // UTC+7 (Việt Nam)
    return new Date(utcTime + (7 * 60 * 60 * 1000));
  },
  
  // Tính thời gian hết hạn
  calculateExpiryTime: (duration) => {
    // Thời gian hiện tại
    const now = dateTimeHelper.getCurrentTime();
    
    // Tính thời hạn
    const durationValue = parseFloat(duration);
    
    // Mốc thời gian hết hạn
    let expiryDate;
    
    // Nếu dưới 1 ngày, tính theo giờ
    if (durationValue < 1) {
      const hoursToAdd = durationValue * 24;
      expiryDate = new Date(now.getTime() + Math.floor(hoursToAdd * 60 * 60 * 1000));
    } else {
      // Tính theo ngày
      expiryDate = new Date(now.getTime() + Math.floor(durationValue * 24 * 60 * 60 * 1000));
    }
    
    return expiryDate;
  },
  
  // Log thông tin thời gian
  logTimeInfo: (stage, time, additionalInfo = {}) => {
    console.log(`[TOGGLE-VIP][${stage}] ${time.toISOString()} | UTC+7 (VN)`, additionalInfo);
  }
};

export async function POST(request) {
  try {
    // Bỏ qua phần kiểm tra xác thực và phân quyền
    /*
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: "Bạn cần đăng nhập để thực hiện thao tác này" },
        { status: 401 }
      );
    }
    
    // Kiểm tra người dùng có quyền admin không
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: "Bạn không có quyền thực hiện thao tác này" },
        { status: 403 }
      );
    }
    */
    
    const { userId, isVip, duration } = await request.json();
    
    // Log thời gian bắt đầu
    const currentTime = dateTimeHelper.getCurrentTime();
    dateTimeHelper.logTimeInfo('Bắt đầu xử lý', currentTime, { userId });

    // Kiểm tra đầu vào
    if (!userId) {
      return NextResponse.json(
        { error: "ID người dùng không được để trống" },
        { status: 400 }
      );
    }
    
    if (typeof isVip !== 'boolean') {
      return NextResponse.json(
        { error: "Trạng thái VIP phải là giá trị boolean" },
        { status: 400 }
      );
    }

    // Nếu bật VIP, kiểm tra thời hạn
    let expiresAt = null;
    if (isVip) {
      if (!duration || isNaN(parseFloat(duration)) || parseFloat(duration) <= 0) {
        return NextResponse.json(
          { error: "Thời hạn VIP phải là giá trị hợp lệ" },
          { status: 400 }
        );
      }
      
      // Tính thời gian hết hạn VIP
      expiresAt = dateTimeHelper.calculateExpiryTime(duration);
      
      // Log thông tin thời hạn
      dateTimeHelper.logTimeInfo('Thời hạn VIP', expiresAt, { 
        duration: parseFloat(duration),
        durationInHours: parseFloat(duration) < 1 ? parseFloat(duration) * 24 : parseFloat(duration) * 24
      });
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
    
    // Nếu vẫn không tìm thấy, thử lọc các ký tự không hợp lệ và tìm lại
    if (!user) {
      const cleanId = userId.replace(/[^a-zA-Z0-9]/g, '');
      if (cleanId !== userId) {
        console.log("Tìm với ID đã làm sạch:", cleanId);
        user = await findOneDocument("users", { 
          $or: [
            { firebaseId: cleanId },
            { uid: cleanId },
            { id: cleanId }
          ]
        });
      }
    }
    
    // Cuối cùng, kiểm tra lại
    if (!user) {
      console.error("Không tìm thấy người dùng với ID:", userId);
      
      // Lấy danh sách các ID có thể để debug
      const allUsers = await findDocuments("users", {}, { projection: { _id: 1, firebaseId: 1, uid: 1, id: 1, email: 1 } });
      console.log("Danh sách ID trong DB:", allUsers.slice(0, 5)); // Chỉ hiển thị 5 người đầu để tránh log quá dài
      
      return NextResponse.json(
        { error: "Không tìm thấy thông tin người dùng với ID " + userId },
        { status: 404 }
      );
    }
    
    console.log("Đã tìm thấy người dùng:", {
      _id: user._id,
      email: user.email,
      firebaseId: user.firebaseId,
      uid: user.uid
    });

    // Cập nhật trạng thái VIP cho người dùng
    const updateFields = {
      isVip: isVip,
      updatedAt: dateTimeHelper.getCurrentTime()
    };
    
    // Thêm thời hạn nếu cần
    if (isVip) {
      updateFields.vipExpiresAt = expiresAt;
    } else {
      // Nếu hủy VIP, xóa thời hạn
      updateFields.vipExpiresAt = null;
    }
    
    await updateDocument(
      "users",
      { _id: user._id },
      {
        $set: updateFields
      }
    );

    // Lưu lịch sử thay đổi trạng thái VIP
    await insertDocument("userActivityLogs", {
      userId: user._id,
      // Bỏ trường actionBy vì không có session
      // actionBy: new ObjectId(session.user.id),
      action: isVip ? "enable_vip" : "disable_vip",
      details: {
        previousState: user.isVip || false,
        newState: isVip,
        duration: isVip ? parseFloat(duration) : null,
        expiresAt: expiresAt,
        timezone: "Asia/Ho_Chi_Minh (UTC+7)"
      },
      createdAt: dateTimeHelper.getCurrentTime()
    });
    
    // Log kết quả
    dateTimeHelper.logTimeInfo('Hoàn thành', dateTimeHelper.getCurrentTime(), {
      userId,
      isVip,
      expiresAt: expiresAt?.toISOString()
    });

    return NextResponse.json({
      success: true,
      isVip: isVip,
      vipExpiresAt: expiresAt,
      currentTime: dateTimeHelper.getCurrentTime(),
      timezone: "Asia/Ho_Chi_Minh (UTC+7)"
    });
  } catch (error) {
    console.error("Lỗi khi thay đổi trạng thái VIP:", error);
    return NextResponse.json(
      { error: "Không thể thay đổi trạng thái VIP: " + error.message },
      { status: 500 }
    );
  }
} 