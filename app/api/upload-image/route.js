import { NextResponse } from "next/server";
import { storage } from "@/app/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // Convert file to array buffer
    const buffer = await file.arrayBuffer();
    const fileName = `course-images/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, "")}`;
    
    // Create a reference to Firebase Storage
    const storageRef = ref(storage, fileName);
    
    // Upload the file
    await uploadBytes(storageRef, buffer, {
      contentType: file.type,
    });

    // Get the download URL
    const url = await getDownloadURL(storageRef);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Error uploading file:", error);
    return NextResponse.json(
      { error: "Error uploading file" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed" },
    { status: 405 }
  );
} 