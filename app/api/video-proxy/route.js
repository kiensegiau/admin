import { NextResponse } from "next/server";
import B2 from 'backblaze-b2';

const b2 = new B2({
  applicationKeyId: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY_ID,
  applicationKey: process.env.NEXT_PUBLIC_B2_APPLICATION_KEY,
});

export async function GET(request) {
  const url = new URL(request.url);
  const videoUrl = url.searchParams.get("url");

  console.log('Video URL:', videoUrl);

  if (!videoUrl) {
    return new NextResponse("Missing video URL", { status: 400 });
  }

  try {
    console.log('Authorizing B2...');
    await b2.authorize();

    console.log('Getting download authorization...');
    const { data: authData } = await b2.getDownloadAuthorization({
      bucketId: process.env.NEXT_PUBLIC_B2_BUCKET_ID,
      fileNamePrefix: videoUrl.split('/').pop(),
      validDurationInSeconds: 3600,
    });

    console.log('Fetching video...');
    const response = await fetch(videoUrl, {
      headers: {
        "Authorization": authData.authorizationToken,
      },
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const body = await response.arrayBuffer();

    return new NextResponse(body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Content-Length": response.headers.get("Content-Length"),
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error fetching video:", error);
    return new NextResponse("Error fetching video", { status: 500 });
  }
}
