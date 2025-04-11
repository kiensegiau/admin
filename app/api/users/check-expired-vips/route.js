export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { findDocuments, updateDocuments } from "@/lib/db";

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
    
    // Cập nhật trạng thái VIP cho những người dùng đã hết hạn
    const updateResult = await updateDocuments(
      "users",
      {
        isVip: true,
        vipExpiresAt: { $lt: bufferTime } // Thêm buffer 5 phút
      },
      {
        $set: {
          isVip: false,
          vipExpiresAt: null,
          updatedAt: now
        }
      }
    );
    
    // Lấy danh sách IDs của người dùng đã hết hạn
    const expiredUserIds = expiredVipUsers.map(user => user._id);
    
    dateTimeHelper.logTimeInfo('Đã cập nhật', now, { 
      updatedCount: updateResult.modifiedCount,
      expiredUserIds: expiredUserIds.map(id => id.toString())
    });
    
    return NextResponse.json({
      message: `Đã cập nhật ${updateResult.modifiedCount} tài khoản VIP hết hạn`,
      updated: updateResult.modifiedCount,
      expiredUserIds: expiredUserIds.map(id => id.toString()),
      serverTime: now.toISOString(),
      serverTimeZone: "UTC+7 (Vietnam)"
    });
  } catch (error) {
    console.error("Lỗi khi kiểm tra VIP hết hạn:", error);
    return NextResponse.json(
      { error: "Không thể cập nhật tài khoản VIP hết hạn: " + error.message },
      { status: 500 }
    );
  }
} 