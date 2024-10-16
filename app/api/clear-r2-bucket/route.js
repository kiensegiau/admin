import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.NEXT_PUBLIC_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.NEXT_PUBLIC_R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.NEXT_PUBLIC_R2_BUCKET_NAME;

async function deleteAllObjects() {
  let continuationToken = null;

  do {
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      ContinuationToken: continuationToken,
    });

    const listedObjects = await s3Client.send(listCommand);

    if (listedObjects.Contents.length === 0) {
      console.log("Bucket đã trống.");
      return;
    }

    const deleteParams = {
      Bucket: BUCKET_NAME,
      Delete: { Objects: [] },
    };

    listedObjects.Contents.forEach(({ Key }) => {
      deleteParams.Delete.Objects.push({ Key });
    });

    const deleteCommand = new DeleteObjectsCommand(deleteParams);
    await s3Client.send(deleteCommand);

    console.log(`Đã xóa ${deleteParams.Delete.Objects.length} đối tượng.`);

    continuationToken = listedObjects.NextContinuationToken;
  } while (continuationToken);
}

export async function POST(req) {
  try {
    await deleteAllObjects();
    return NextResponse.json({ message: "Đã xóa tất cả dữ liệu trong bucket thành công." });
  } catch (error) {
    console.error("Lỗi khi xóa dữ liệu:", error);
    return NextResponse.json({ error: "Không thể xóa dữ liệu trong bucket" }, { status: 500 });
  }
}