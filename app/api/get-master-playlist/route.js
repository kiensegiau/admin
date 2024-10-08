import { NextResponse } from "next/server";
import { r2Client } from "../../utils/r2DirectUpload";
import { GetObjectCommand } from "@aws-sdk/client-s3";

export async function GET(req) {
  console.log("GET request received for get-master-playlist");
  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("fileId");

  console.log("Received fileId:", fileId);

  if (!fileId) {
    console.log("Missing fileId parameter");
    return NextResponse.json(
      { error: "Missing fileId parameter" },
      { status: 400 }
    );
  }

  try {
    console.log("Attempting to get object from R2");
    const command = new GetObjectCommand({
      Bucket: process.env.NEXT_PUBLIC_R2_BUCKET_NAME,
      Key: fileId,
    });
    const response = await r2Client.send(command);

    if (!response.Body) {
      console.log("File not found in R2");
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    console.log("Object fetched successfully from R2");
    console.log("Attempting to read object content");
    const content = await response.Body.transformToString();
    console.log("Object content read successfully");

    console.log("Returning content to client");
    return NextResponse.json({ content }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error) {
    console.error("Error in get-master-playlist:", error);
    console.error("Error stack:", error.stack);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
