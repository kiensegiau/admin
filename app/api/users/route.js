import { NextResponse } from "next/server";
import { findDocuments, countDocuments } from "@/lib/db";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Các tham số phân trang
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;
    
    // Các tham số lọc
    const searchTerm = searchParams.get('search') || '';
    const isActive = searchParams.get('isActive');
    const role = searchParams.get('role');
    
    // Xây dựng query
    const query = {};
    
    if (searchTerm) {
      query.$or = [
        { fullName: { $regex: searchTerm, $options: 'i' } },
        { email: { $regex: searchTerm, $options: 'i' } }
      ];
    }
    
    if (isActive !== null && isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (role) {
      query.role = role;
    }
    
    // Cấu hình sort
    const sortField = searchParams.get('sortField') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;
    const sort = { [sortField]: sortOrder };
    
    // Thực hiện truy vấn
    const users = await findDocuments('users', query, {
      sort,
      limit,
      skip,
    });
    
    // Đếm tổng số bản ghi
    const total = await countDocuments('users', query);
    
    // Tính toán thông tin phân trang
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    // Lấy thông tin profile và tài chính cho mỗi người dùng nếu cần
    const includeProfile = searchParams.get('includeProfile') === 'true';
    const includeFinance = searchParams.get('includeFinance') === 'true';
    
    let enhancedUsers = users;
    
    if (includeProfile || includeFinance) {
      const userIds = users.map(user => user._id);
      
      const profiles = includeProfile 
        ? await findDocuments('userProfiles', { userId: { $in: userIds } }) 
        : [];
      
      const finances = includeFinance 
        ? await findDocuments('userFinances', { userId: { $in: userIds } }) 
        : [];
      
      // Map profiles và finances vào users
      enhancedUsers = users.map(user => {
        const userData = {
          ...user,
          id: user._id.toString()
        };
        
        if (includeProfile) {
          const profile = profiles.find(p => p.userId.toString() === user._id.toString());
          if (profile) {
            userData.profile = { ...profile, id: profile._id.toString() };
            delete userData.profile._id;
            delete userData.profile.userId;
          }
        }
        
        if (includeFinance) {
          const finance = finances.find(f => f.userId.toString() === user._id.toString());
          if (finance) {
            userData.finance = { ...finance, id: finance._id.toString() };
            delete userData.finance._id;
            delete userData.finance.userId;
          }
        }
        
        delete userData._id;
        return userData;
      });
    } else {
      // Chỉ format lại _id thành id
      enhancedUsers = users.map(user => ({
        ...user,
        id: user._id.toString(),
        _id: undefined
      }));
    }
    
    return NextResponse.json({
      users: enhancedUsers,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPrevPage
      }
    });
  } catch (error) {
    console.error("Lỗi chi tiết:", error);
    return NextResponse.json(
      { error: `Không thể lấy danh sách người dùng: ${error.message}` },
      { status: 500 }
    );
  }
}
