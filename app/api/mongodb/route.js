import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  findDocuments,
  findOneDocument,
  insertDocument,
  updateDocument,
  deleteDocument
} from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * API tổng quát để thao tác với MongoDB
 * Hỗ trợ các thao tác CRUD cơ bản
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get("collection");
    const id = searchParams.get("id");
    const queryParam = searchParams.get("query");

    if (!collection) {
      return NextResponse.json({ error: "Thiếu tham số collection" }, { status: 400 });
    }
    
    let query = {};
    
    // Truy vấn theo ID nếu có
    if (id) {
      query = { _id: new ObjectId(id) };
      
      const document = await findOneDocument(collection, query);
      
      if (!document) {
        return NextResponse.json({ error: "Không tìm thấy tài liệu" }, { status: 404 });
      }
      
      return NextResponse.json({ success: true, data: document });
    }
    
    // Truy vấn theo điều kiện tùy chỉnh nếu có
    if (queryParam) {
      try {
        query = JSON.parse(queryParam);
        
        // Chuyển đổi các chuỗi ID thành ObjectId nếu có
        if (query._id) {
          query._id = new ObjectId(query._id);
        }
        
        if (query.courseId) {
          query.courseId = new ObjectId(query.courseId);
        }
      } catch (error) {
        return NextResponse.json({ error: "Query không hợp lệ" }, { status: 400 });
      }
    }
    
    const documents = await findDocuments(collection, query);
    
    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("Lỗi khi truy vấn MongoDB:", error);
    return NextResponse.json(
      { error: "Lỗi khi truy vấn: " + error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get("collection");
    
    if (!collection) {
      return NextResponse.json({ error: "Thiếu tham số collection" }, { status: 400 });
    }
    
    const data = await request.json();
    
    if (!data) {
      return NextResponse.json({ error: "Không có dữ liệu" }, { status: 400 });
    }
    
    // Thêm timestamps
    const documentToInsert = {
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await insertDocument(collection, documentToInsert);
    
    return NextResponse.json({ 
      success: true, 
      id: result.insertedId,
      message: "Đã thêm tài liệu thành công" 
    });
  } catch (error) {
    console.error("Lỗi khi thêm dữ liệu vào MongoDB:", error);
    return NextResponse.json(
      { error: "Lỗi khi thêm dữ liệu: " + error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get("collection");
    const id = searchParams.get("id");
    const queryParam = searchParams.get("query");
    
    if (!collection) {
      return NextResponse.json({ error: "Thiếu tham số collection" }, { status: 400 });
    }
    
    if (!id && !queryParam) {
      return NextResponse.json({ error: "Thiếu ID hoặc query" }, { status: 400 });
    }
    
    const data = await request.json();
    
    if (!data) {
      return NextResponse.json({ error: "Không có dữ liệu" }, { status: 400 });
    }
    
    // Thêm timestamp cập nhật
    const updateData = {
      ...data,
      updatedAt: new Date()
    };
    
    let query = {};
    
    if (id) {
      query = { _id: new ObjectId(id) };
    } else if (queryParam) {
      try {
        query = JSON.parse(queryParam);
        
        // Chuyển đổi các chuỗi ID thành ObjectId nếu có
        if (query._id) {
          query._id = new ObjectId(query._id);
        }
        
        if (query.courseId) {
          query.courseId = new ObjectId(query.courseId);
        }
      } catch (error) {
        return NextResponse.json({ error: "Query không hợp lệ" }, { status: 400 });
      }
    }
    
    const result = await updateDocument(collection, query, { $set: updateData });
    
    if (result.modifiedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Không có tài liệu nào được cập nhật" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      modifiedCount: result.modifiedCount,
      message: "Đã cập nhật tài liệu thành công" 
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật dữ liệu trong MongoDB:", error);
    return NextResponse.json(
      { error: "Lỗi khi cập nhật dữ liệu: " + error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const collection = searchParams.get("collection");
    const id = searchParams.get("id");
    const queryParam = searchParams.get("query");
    
    if (!collection) {
      return NextResponse.json({ error: "Thiếu tham số collection" }, { status: 400 });
    }
    
    if (!id && !queryParam) {
      return NextResponse.json({ error: "Thiếu ID hoặc query" }, { status: 400 });
    }
    
    let query = {};
    
    if (id) {
      query = { _id: new ObjectId(id) };
    } else if (queryParam) {
      try {
        query = JSON.parse(queryParam);
        
        // Chuyển đổi các chuỗi ID thành ObjectId nếu có
        if (query._id) {
          query._id = new ObjectId(query._id);
        }
        
        if (query.courseId) {
          query.courseId = new ObjectId(query.courseId);
        }
      } catch (error) {
        return NextResponse.json({ error: "Query không hợp lệ" }, { status: 400 });
      }
    }
    
    const result = await deleteDocument(collection, query);
    
    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Không có tài liệu nào được xóa" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      deletedCount: result.deletedCount,
      message: "Đã xóa tài liệu thành công" 
    });
  } catch (error) {
    console.error("Lỗi khi xóa dữ liệu trong MongoDB:", error);
    return NextResponse.json(
      { error: "Lỗi khi xóa dữ liệu: " + error.message },
      { status: 500 }
    );
  }
} 