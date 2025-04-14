export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { findDocuments, updateDocuments, deleteDocument, findOneDocument } from "@/lib/db";
import { auth } from "@/lib/firebase-admin";
import { ObjectId } from 'mongodb';

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
        // Kiểm tra và xóa tài khoản Firebase Auth
        let firebaseDeleted = false;
        
        // Ưu tiên xóa bằng email (đảm bảo nhất)
        if (user.email) {
          try {
            console.log(`Đang tìm và xóa tài khoản Firebase Auth với email: ${user.email}`);
            const firebaseUser = await auth.getUserByEmail(user.email);
            if (firebaseUser && firebaseUser.uid) {
              await auth.deleteUser(firebaseUser.uid);
              firebaseDeleted = true;
              dateTimeHelper.logTimeInfo('Đã xóa Firebase Auth với email', now, { 
                userId: user._id.toString(),
                email: user.email,
                firebaseUid: firebaseUser.uid
              });
            }
          } catch (firebaseError) {
            console.error(`Lỗi khi xóa Firebase Auth với email ${user.email}:`, firebaseError);
            // Nếu lỗi user-not-found, tiếp tục với các phương pháp khác
            if (firebaseError.code !== 'auth/user-not-found') {
              errors.push({
                userId: user._id.toString(),
                error: `Firebase (email): ${firebaseError.message}`,
                code: firebaseError.code
              });
            }
          }
        }
        
        // Nếu chưa xóa được và có firebaseId, thử xóa bằng firebaseId
        if (!firebaseDeleted && user.firebaseId) {
          try {
            console.log(`Đang xóa tài khoản Firebase Auth với firebaseId: ${user.firebaseId}`);
            await auth.deleteUser(user.firebaseId);
            firebaseDeleted = true;
            dateTimeHelper.logTimeInfo('Đã xóa Firebase Auth với firebaseId', now, { 
              userId: user._id.toString(),
              firebaseId: user.firebaseId
            });
          } catch (firebaseError) {
            console.error(`Lỗi khi xóa Firebase Auth với firebaseId ${user.firebaseId}:`, firebaseError);
            
            // Nếu lỗi không tìm thấy người dùng, tiếp tục với cách khác
            if (firebaseError.code !== 'auth/user-not-found') {
              errors.push({
                userId: user._id.toString(),
                error: `Firebase (firebaseId): ${firebaseError.message}`,
                code: firebaseError.code
              });
            }
          }
        }
        
        // Nếu chưa xóa được và có uid, thử xóa bằng uid
        if (!firebaseDeleted && user.uid) {
          try {
            console.log(`Đang xóa tài khoản Firebase Auth với uid: ${user.uid}`);
            await auth.deleteUser(user.uid);
            firebaseDeleted = true;
            dateTimeHelper.logTimeInfo('Đã xóa Firebase Auth với uid', now, { 
              userId: user._id.toString(),
              uid: user.uid
            });
          } catch (firebaseError) {
            console.error(`Lỗi khi xóa Firebase Auth với uid ${user.uid}:`, firebaseError);
            
            if (firebaseError.code !== 'auth/user-not-found') {
              errors.push({
                userId: user._id.toString(),
                error: `Firebase (uid): ${firebaseError.message}`,
                code: firebaseError.code
              });
            }
          }
        }
        
        // Xóa người dùng từ MongoDB
        try {
          // Nếu có email, xóa theo email (đảm bảo nhất)
          if (user.email) {
            await deleteDocument("users", { email: user.email });
            deletedCount++;
            dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng email', now, { 
              email: user.email,
              name: user.fullName
            });
          } 
          // Nếu không có email, xóa theo _id
          else if (user._id) {
            await deleteDocument("users", { _id: user._id });
            deletedCount++;
            dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng _id', now, { 
              userId: user._id ? user._id.toString() : 'unknown',
              name: user.fullName
            });
          }
          // Thử theo id thông thường
          else if (user.id) {
            await deleteDocument("users", { id: user.id });
            deletedCount++;
            dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng id', now, { 
              id: user.id,
              name: user.fullName
            });
          } else {
            throw new Error("Không tìm thấy định danh phù hợp để xóa người dùng");
          }
        } catch (mongoError) {
          console.error(`Lỗi khi xóa MongoDB cho user:`, mongoError);
          
          // Thử xóa bằng các cách khác nếu cách đầu tiên thất bại
          try {
            let deleteSuccess = false;
            
            // Nếu cách ưu tiên không phải là email, thử xóa bằng email
            if (user.email && !user.email.includes('deleted_')) {
              await deleteDocument("users", { email: user.email });
              deleteSuccess = true;
              dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng email (phương án B)', now, { email: user.email });
            } 
            // Nếu không thành công và có id
            else if (user.id) {
              await deleteDocument("users", { id: user.id });
              deleteSuccess = true;
              dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng id (phương án B)', now, { id: user.id });
            }
            // Nếu không thành công với id, thử _id
            else if (user._id) {
              await deleteDocument("users", { _id: user._id });
              deleteSuccess = true;
              dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng _id (phương án B)', now, { _id: user._id.toString() });
            }
            
            if (deleteSuccess) {
              if (!deletedCount) deletedCount++;
            } else {
              throw new Error("Không tìm thấy dữ liệu thay thế để xóa");
            }
          } catch (retryError) {
            console.error("Lỗi khi xóa lại:", retryError);
            errors.push({
              userId: user._id ? user._id.toString() : 'unknown',
              error: `MongoDB: ${mongoError.message}, Retry: ${retryError.message}`
            });
          }
        }
      } catch (error) {
        console.error(`Lỗi khi xóa người dùng:`, error);
        errors.push({
          userId: user._id ? user._id.toString() : 'unknown',
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

// Thêm endpoint POST để xóa thủ công một người dùng
export async function POST(request) {
  try {
    const { userId, email, firebaseId, uid } = await request.json();
    
    // Kiểm tra có ít nhất một thông tin để tìm người dùng
    if (!userId && !email && !firebaseId && !uid) {
      return NextResponse.json(
        { error: "Cần cung cấp ít nhất một thông tin để xóa người dùng (userId, email, firebaseId, uid)" },
        { status: 400 }
      );
    }
    
    // Lấy thời gian hiện tại theo múi giờ Việt Nam
    const now = dateTimeHelper.getCurrentTime();
    dateTimeHelper.logTimeInfo('Bắt đầu xóa thủ công', now, { userId, email, firebaseId, uid });
    
    // Tìm người dùng trong MongoDB
    let query = {};
    if (userId) {
      if (/^[0-9a-fA-F]{24}$/.test(userId)) {
        // Nếu là chuỗi hex 24 ký tự hợp lệ, tạo ObjectId
        try {
          query._id = new ObjectId(userId);
        } catch (error) {
          console.error("Lỗi chuyển đổi ObjectId:", error);
          // Nếu có lỗi, sử dụng id thông thường
          query.id = userId;
        }
      } else {
        // Không phải ObjectId, tìm theo các trường khác
        query = {
          $or: [
            { id: userId },
            { uid: userId },
            { firebaseId: userId }
          ]
        };
      }
    } else if (firebaseId) {
      query.firebaseId = firebaseId;
    } else if (uid) {
      query.uid = uid;
    } else if (email) {
      query.email = email;
    }
    
    console.log("Truy vấn tìm kiếm:", JSON.stringify(query));
    const user = await findOneDocument("users", query);
    
    if (!user) {
      return NextResponse.json(
        { error: "Không tìm thấy người dùng với thông tin đã cung cấp" },
        { status: 404 }
      );
    }
    
    console.log("Đã tìm thấy người dùng:", {
      _id: user._id?.toString(),
      id: user.id,
      email: user.email,
      firebaseId: user.firebaseId,
      uid: user.uid
    });
    
    // Xóa người dùng khỏi Firebase Auth
    let firebaseDeleted = false;
    const errors = [];
    let deletedCount = 0;
    
    // Ưu tiên xóa bằng email (đảm bảo nhất)
    if (user.email) {
      try {
        console.log(`Đang tìm và xóa tài khoản Firebase Auth với email: ${user.email}`);
        const firebaseUser = await auth.getUserByEmail(user.email);
        if (firebaseUser && firebaseUser.uid) {
          await auth.deleteUser(firebaseUser.uid);
          firebaseDeleted = true;
          dateTimeHelper.logTimeInfo('Đã xóa Firebase Auth với email', now, { 
            userId: user._id.toString(),
            email: user.email,
            firebaseUid: firebaseUser.uid
          });
        }
      } catch (firebaseError) {
        console.error(`Lỗi khi xóa Firebase Auth với email ${user.email}:`, firebaseError);
        // Nếu lỗi user-not-found, tiếp tục với các phương pháp khác
        if (firebaseError.code !== 'auth/user-not-found') {
          errors.push({
            userId: user._id.toString(),
            error: `Firebase (email): ${firebaseError.message}`,
            code: firebaseError.code
          });
        }
      }
    }
    
    // Nếu chưa xóa được và có firebaseId, thử xóa bằng firebaseId
    if (!firebaseDeleted && user.firebaseId) {
      try {
        console.log(`Đang xóa tài khoản Firebase Auth với firebaseId: ${user.firebaseId}`);
        await auth.deleteUser(user.firebaseId);
        firebaseDeleted = true;
        dateTimeHelper.logTimeInfo('Đã xóa Firebase Auth với firebaseId', now, { 
          userId: user._id.toString(),
          firebaseId: user.firebaseId
        });
      } catch (firebaseError) {
        console.error(`Lỗi khi xóa Firebase Auth với firebaseId ${user.firebaseId}:`, firebaseError);
        
        // Nếu lỗi không tìm thấy người dùng, tiếp tục với cách khác
        if (firebaseError.code !== 'auth/user-not-found') {
          errors.push({
            userId: user._id.toString(),
            error: `Firebase (firebaseId): ${firebaseError.message}`,
            code: firebaseError.code
          });
        }
      }
    }
    
    // Nếu chưa xóa được và có uid, thử xóa bằng uid
    if (!firebaseDeleted && user.uid) {
      try {
        console.log(`Đang xóa tài khoản Firebase Auth với uid: ${user.uid}`);
        await auth.deleteUser(user.uid);
        firebaseDeleted = true;
        dateTimeHelper.logTimeInfo('Đã xóa Firebase Auth với uid', now, { 
          userId: user._id.toString(),
          uid: user.uid
        });
      } catch (firebaseError) {
        console.error(`Lỗi khi xóa Firebase Auth với uid ${user.uid}:`, firebaseError);
        
        if (firebaseError.code !== 'auth/user-not-found') {
          errors.push({
            error: `Firebase (uid): ${firebaseError.message}`,
            code: firebaseError.code
          });
        }
      }
    }
    
    // Xóa người dùng từ MongoDB
    try {
      // Nếu có email, xóa theo email (đảm bảo nhất)
      if (user.email) {
        await deleteDocument("users", { email: user.email });
        deletedCount++;
        dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng email', now, { 
          email: user.email,
          name: user.fullName
        });
      } 
      // Nếu không có email, xóa theo _id
      else if (user._id) {
        await deleteDocument("users", { _id: user._id });
        deletedCount++;
        dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng _id', now, { 
          userId: user._id ? user._id.toString() : 'unknown',
          name: user.fullName
        });
      }
      // Thử theo id thông thường
      else if (user.id) {
        await deleteDocument("users", { id: user.id });
        deletedCount++;
        dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng id', now, { 
          id: user.id,
          name: user.fullName
        });
      } else {
        throw new Error("Không tìm thấy định danh phù hợp để xóa người dùng");
      }
    } catch (mongoError) {
      console.error(`Lỗi khi xóa MongoDB cho user:`, mongoError);
      
      // Thử xóa bằng các cách khác nếu cách đầu tiên thất bại
      try {
        let deleteSuccess = false;
        
        // Nếu cách ưu tiên không phải là email, thử xóa bằng email
        if (user.email && !user.email.includes('deleted_')) {
          await deleteDocument("users", { email: user.email });
          deleteSuccess = true;
          dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng email (phương án B)', now, { email: user.email });
        } 
        // Nếu không thành công và có id
        else if (user.id) {
          await deleteDocument("users", { id: user.id });
          deleteSuccess = true;
          dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng id (phương án B)', now, { id: user.id });
        }
        // Nếu không thành công với id, thử _id
        else if (user._id) {
          await deleteDocument("users", { _id: user._id });
          deleteSuccess = true;
          dateTimeHelper.logTimeInfo('Đã xóa người dùng bằng _id (phương án B)', now, { _id: user._id.toString() });
        }
        
        if (deleteSuccess) {
          if (!deletedCount) deletedCount++;
        } else {
          throw new Error("Không tìm thấy dữ liệu thay thế để xóa");
        }
      } catch (retryError) {
        console.error("Lỗi khi xóa lại:", retryError);
        errors.push({
          userId: user._id ? user._id.toString() : 'unknown',
          error: `MongoDB: ${mongoError.message}, Retry: ${retryError.message}`
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      message: "Đã xóa người dùng thành công",
      user: {
        _id: user._id.toString(),
        name: user.fullName,
        email: user.email,
      },
      firebaseDeleted,
      errors: errors.length > 0 ? errors : null,
    });
    
  } catch (error) {
    console.error("Lỗi khi xóa người dùng thủ công:", error);
    return NextResponse.json(
      { error: "Không thể xóa người dùng: " + error.message },
      { status: 500 }
    );
  }
} 