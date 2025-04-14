export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { findDocuments, updateDocuments, deleteDocument } from "@/lib/db";
import { auth } from "@/lib/firebase-admin";

// Hàm tiện ích xử lý thời gian
const dateTimeHelper = {
  // Hàm lấy thời gian hiện tại theo múi giờ Việt Nam
  getCurrentTime: () => {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    // UTC+7 (Việt Nam)
    return new Date(utcTime + (7 * 60 * 60 * 1000));
  },
  
  // Thêm buffer thời gian (phút)
  addBufferTime: (date, bufferMinutes = 0) => {
    return new Date(date.getTime() + (bufferMinutes * 60 * 1000));
  },
  
  // Trừ buffer thời gian (phút)
  subtractBufferTime: (date, bufferMinutes = 0) => {
    return new Date(date.getTime() - (bufferMinutes * 60 * 1000));
  },
  
  // Tính khoảng cách thời gian (phút)
  getTimeDifferenceInMinutes: (date1, date2) => {
    return Math.floor((date1 - date2) / (60 * 1000));
  },
  
  // Log thông tin thời gian
  logTimeInfo: (stage, time, additionalInfo = {}) => {
    console.log(`[CHECK-VIP][${stage}] ${time.toISOString()} | UTC+7 (VN)`, additionalInfo);
  }
};

export async function GET() {
  try {
    // Lấy thời gian hiện tại theo múi giờ Việt Nam
    const now = dateTimeHelper.getCurrentTime();
    dateTimeHelper.logTimeInfo('Thời gian hiện tại', now);
    
    // Tìm những người dùng có isVip=true và vipExpiresAt < thời điểm hiện tại
    const expiredVipUsers = await findDocuments("users", {
      isVip: true,
      vipExpiresAt: { $lt: now }
    });
    
    dateTimeHelper.logTimeInfo('Tìm thấy VIP hết hạn', now, { count: expiredVipUsers.length });
    
    // Log chi tiết các tài khoản sắp hết hạn để debug
    const nextTwoHours = dateTimeHelper.addBufferTime(now, 120); // Thêm 2 giờ
    const almostExpiredUsers = await findDocuments("users", {
      isVip: true,
      vipExpiresAt: { 
        $gt: now,
        $lt: nextTwoHours
      }
    });
    
    dateTimeHelper.logTimeInfo('Tài khoản sắp hết hạn', now, { count: almostExpiredUsers.length });
    
    if (almostExpiredUsers.length > 0) {
      almostExpiredUsers.forEach(user => {
        const vipExpiry = user.vipExpiresAt;
        const timeUntilExpiry = dateTimeHelper.getTimeDifferenceInMinutes(vipExpiry, now);
        
        dateTimeHelper.logTimeInfo('Sắp hết hạn', vipExpiry, {
          userId: user._id.toString(),
          name: user.fullName,
          minutesRemaining: timeUntilExpiry,
          hoursRemaining: (timeUntilExpiry / 60).toFixed(1)
        });
      });
    }
    
    if (expiredVipUsers.length === 0) {
      return NextResponse.json({ 
        message: "Không có tài khoản VIP nào hết hạn", 
        updated: 0,
        serverTime: now.toISOString(),
        serverTimeZone: "UTC+7 (Vietnam)"
      });
    }
    
    // Log chi tiết các tài khoản hết hạn để debug
    expiredVipUsers.forEach(user => {
      const vipExpiry = user.vipExpiresAt;
      const expiredFor = dateTimeHelper.getTimeDifferenceInMinutes(now, vipExpiry);
      
      dateTimeHelper.logTimeInfo('Đã hết hạn', vipExpiry, {
        userId: user._id.toString(),
        name: user.fullName,
        expiredForMinutes: expiredFor,
        expiredForHours: (expiredFor / 60).toFixed(1)
      });
    });
    
    // Thêm buffer 5 phút để tránh lỗi múi giờ
    const bufferTime = dateTimeHelper.subtractBufferTime(now, 5);
    
    // Lấy danh sách IDs của người dùng đã hết hạn
    const expiredUserIds = expiredVipUsers.map(user => user._id);
    
    // Xóa người dùng khỏi Firebase Auth và MongoDB
    let deletedCount = 0;
    const errors = [];
    
    for (const user of expiredVipUsers) {
      try {
        // Nếu có firebaseId, xóa tài khoản Firebase Auth
        if (user.firebaseId) {
          try {
            await auth.deleteUser(user.firebaseId);
            dateTimeHelper.logTimeInfo('Đã xóa Firebase Auth', now, { 
              userId: user._id.toString(),
              firebaseId: user.firebaseId
            });
          } catch (firebaseError) {
            console.error(`Lỗi khi xóa Firebase Auth cho user ${user._id}:`, firebaseError);
            errors.push({
              userId: user._id.toString(),
              error: `Firebase: ${firebaseError.message}`
            });
          }
        }
        
        // Xóa người dùng từ MongoDB
        await deleteDocument("users", { _id: user._id });
        deletedCount++;
        dateTimeHelper.logTimeInfo('Đã xóa người dùng', now, { 
          userId: user._id.toString(),
          name: user.fullName
        });
      } catch (error) {
        console.error(`Lỗi khi xóa người dùng ${user._id}:`, error);
        errors.push({
          userId: user._id.toString(),
          error: error.message
        });
      }
    }
    
    dateTimeHelper.logTimeInfo('Hoàn thành xóa', now, { 
      deletedCount,
      errorsCount: errors.length
    });
    
    return NextResponse.json({
      message: `Đã xóa ${deletedCount} tài khoản VIP hết hạn`,
      deleted: deletedCount,
      expiredUserIds: expiredUserIds.map(id => id.toString()),
      errors: errors.length > 0 ? errors : null,
      serverTime: now.toISOString(),
      serverTimeZone: "UTC+7 (Vietnam)"
    });
  } catch (error) {
    console.error("Lỗi khi kiểm tra và xóa tài khoản VIP hết hạn:", error);
    return NextResponse.json(
      { error: "Không thể xóa tài khoản VIP hết hạn: " + error.message },
      { status: 500 }
    );
  }
} 