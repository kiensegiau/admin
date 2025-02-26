import { NextResponse } from "next/server";
import axios from "axios";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export class HelvidUploader {
  static uploadKeyCache = null;
  static uploadKeyTimestamp = null;
  static uploadCount = 0;
  static MAX_UPLOADS_PER_KEY = 10;

  constructor() {
    this.client = axios.create({
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "vi,en-US;q=0.9,en;q=0.8,fr-FR;q=0.7,fr;q=0.6",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        origin: "https://helvid.com",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    // Set cookies
    this.cookies = {
      remember_me:
        "8a0c04e7dcfa0c22a33bbd25b80671ab0ef28fd26efd35472318eddfeff675493c6c0eb71e97030adb28d43dc3016505b13d",
      cscms_user_id: "60d0bJDb-jR57iUo3V234v57CmuJcU2wMTdNtoduzTGPzQ",
      cscms_user_login:
        "7c1fhJRTgnICYxAI4nG1Rbr%2FX1J0cBRPdTfGyYy1uti4oaE-1qSqutP6oS00bmr2pHMn3uu0TBR4XeXitQ",
      cf_clearance:
        "MIUX5QsrptYbaamUI9OID5TqqqtOgT1LqGYLAV4Km24-1740581914-1.2.1.1-sQWYaXUQNYLEWTOH6HrbtEOioEJ0fd8PXPXz90jKwTq1tor.7KIs7U0J3x3A8TtASQoYpGJH6S3Eb2okpfxHWFI21fhf5k7SbSzo2XaREzWNEQ4UaMeizqZwBuq9NzuNpJJLzEtCdvyEplm3oeXqsFV6x_UGAyf4.6ZgRcyT2PVLCXGDCRuDDlaeIc.ikeaLHIDnr_5NhqO7dsIZzio8aHneeE4Kt6DJaF_9jH6UHDZOj8v4hM1TN62LmtAI1POe4TJD02ej3_l5UJT_TVa6nRtjJt6hjXktFztNWC7kgc4",
    };
  }

  _formatCookies() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  async getUploadKey(forceNew = false) {
    // Kiểm tra xem có thể sử dụng key cache không
    if (
      !forceNew &&
      HelvidUploader.uploadKeyCache &&
      HelvidUploader.uploadCount < HelvidUploader.MAX_UPLOADS_PER_KEY
    ) {
      HelvidUploader.uploadCount++;
      return HelvidUploader.uploadKeyCache;
    }

    try {
      const response = await this.client.post(
        "https://helvid.com/upload/getkey",
        {
          cid: "15",
          mycid: "0",
          fid: "21",
          folder_id: "",
        },
        {
          headers: {
            authority: "helvid.com",
            referer: "https://helvid.com/upload/loadurl",
            "sec-fetch-site": "same-origin",
            cookie: this._formatCookies(),
          },
        }
      );

      // Cập nhật cache
      HelvidUploader.uploadKeyCache = response.data;
      HelvidUploader.uploadKeyTimestamp = Date.now();
      HelvidUploader.uploadCount = 1;

      return response.data;
    } catch (error) {
      console.error("Error getting upload key:", error.message);
      throw error;
    }
  }

  async uploadFile(driveUrl, uploadKey) {
    try {
      // Tạo FormData để gửi dữ liệu
      const formData = new URLSearchParams();
      formData.append("videoUrl", driveUrl);
      formData.append("folder_id", "");

      const response = await this.client.post(
        `https://remote.helvid.com/upload.php?key=${uploadKey.data}`, // Sử dụng uploadKey.data
        formData.toString(), // Gửi dữ liệu dưới dạng form urlencoded
        {
          headers: {
            authority: "remote.helvid.com",
            referer: "https://helvid.com/",
            "sec-fetch-site": "same-site",
            cookie: this._formatCookies(),
            "content-type": "application/x-www-form-urlencoded", // Đảm bảo content-type đúng
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error("Error uploading file:", error.message);
      throw error;
    }
  }

  async getVideoDetails(did) {
    try {
      const response = await axios.get(
        `https://helvid.com/api/getvideodetail_by_id/${did}?apikey=F3ziE0vwcNP2W57i6j1bdk4QjbwNX`,
        {
          headers: {
            accept: "application/json",
          },
        }
      );

      if (response.data.status === "success" && response.data.data) {
        return response.data.data;
      }

      throw new Error("Không thể lấy được thông tin video");
    } catch (error) {
      console.error("Error getting video details:", error);
      throw error;
    }
  }

  async uploadFromDrive(driveUrl) {
    try {
      console.log("Getting upload key...");
      const uploadKey = await this.getUploadKey();

      console.log("Uploading file...");
      const uploadResponse = await this.uploadFile(driveUrl, uploadKey);

      if (uploadResponse.code !== 1) {
        throw new Error("Upload failed");
      }

      // Lấy thông tin video từ API mới
      console.log("Getting video details...");
      const videoDetails = await this.getVideoDetails(uploadResponse.did);

      const videoUrl = `https://helvid.net/play/index/${videoDetails.vid}`;

      return {
        success: true,
        data: {
          videoUrl,
          originalUrl: `https://helvid.com/video/${uploadResponse.did}`,
          debug: {
            originalDid: uploadResponse.did,
            videoDetails,
            uploadKeyUsageCount: HelvidUploader.uploadCount,
          },
        },
      };
    } catch (error) {
      console.error("Upload process failed:", error.message);
      return {
        success: false,
        error: error.message || "Upload failed",
      };
    }
  }
}

export async function POST(request) {
  try {
    const { driveUrl } = await request.json();
    if (!driveUrl) {
      return NextResponse.json({ error: "Missing drive URL" }, { status: 400 });
    }

    const uploader = new HelvidUploader();
    const result = await uploader.uploadFromDrive(driveUrl);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Upload failed",
      },
      { status: 500 }
    );
  }
}
