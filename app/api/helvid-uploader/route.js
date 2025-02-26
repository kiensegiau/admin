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
    const cacheStatus = {
      hasCache: !!HelvidUploader.uploadKeyCache,
      currentCount: HelvidUploader.uploadCount,
      maxUploads: HelvidUploader.MAX_UPLOADS_PER_KEY,
    };
    console.log("Cache status:", cacheStatus);

    if (
      !forceNew &&
      HelvidUploader.uploadKeyCache &&
      HelvidUploader.uploadCount < HelvidUploader.MAX_UPLOADS_PER_KEY &&
      Date.now() - HelvidUploader.uploadKeyTimestamp < 3600000
    ) {
      console.log("Using cached upload key");
      HelvidUploader.uploadCount++;
      return HelvidUploader.uploadKeyCache;
    }

    console.log("Getting new upload key from server");
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

      console.log("New upload key cached");
      return response.data;
    } catch (error) {
      console.error("Error getting upload key:", error.message);
      throw error;
    }
  }

  async uploadFile(driveUrl, uploadKey) {
    console.log("=== Bắt đầu upload file ===");
    console.log("Drive URL:", driveUrl);
    console.log("Upload Key:", uploadKey);

    try {
      const formData = new URLSearchParams();
      formData.append("videoUrl", driveUrl);
      formData.append("folder_id", "");

      const uploadUrl = `https://remote.helvid.com/upload.php?key=${uploadKey.data}`;
      console.log("Request URL:", uploadUrl);
      console.log("Request Data:", formData.toString());
      console.log("Request Headers:", {
        authority: "remote.helvid.com",
        referer: "https://helvid.com/",
        "sec-fetch-site": "same-site",
        cookie: this._formatCookies(),
        "content-type": "application/x-www-form-urlencoded",
      });

      const response = await this.client.post(uploadUrl, formData.toString(), {
        headers: {
          authority: "remote.helvid.com",
          referer: "https://helvid.com/",
          "sec-fetch-site": "same-site",
          cookie: this._formatCookies(),
          "content-type": "application/x-www-form-urlencoded",
        },
      });

      console.log("=== Response từ server ===");
      console.log("Status:", response.status);
      console.log("Headers:", response.headers);
      console.log("Data:", JSON.stringify(response.data, null, 2));

      if (response.data.did === 0) {
        console.error(
          "Server trả về did = 0, có thể có lỗi trong quá trình upload"
        );
        console.log("Full response object:", response);
      }

      return response.data;
    } catch (error) {
      console.error("Chi tiết lỗi upload:", {
        message: error.message,
        response: {
          data: error.response?.data,
          status: error.response?.status,
          headers: error.response?.headers,
        },
        request: {
          url: uploadUrl,
          data: formData.toString(),
          headers: error.config?.headers,
        },
      });
      throw error;
    }
  }

  async getVideoDetails(did) {
    console.log("=== Bắt đầu lấy thông tin video ===");
    console.log("DID:", did);

    try {
      const apiUrl = `https://helvid.com/api/getvideodetail_by_id/${did}?apikey=F3ziE0vwcNP2W57i6j1bdk4QjbwNX`;
      console.log("URL API:", apiUrl);

      const response = await axios.get(apiUrl, {
        headers: {
          accept: "application/json",
        },
      });

      console.log("Response data:", JSON.stringify(response.data, null, 2));

      if (response.data.status === "success" && response.data.data) {
        console.log("Thông tin video hợp lệ:", response.data.data);
        return response.data.data;
      }

      console.error("Response không hợp lệ:", response.data);
      throw new Error(
        `Không thể lấy được thông tin video. Status: ${response.data.status}`
      );
    } catch (error) {
      console.error("Chi tiết lỗi:", {
        message: error.message,
        responseData: error.response?.data,
        status: error.response?.status,
        did: did,
      });
      throw error;
    }
  }

  async uploadFromDrive(driveUrl) {
    console.log("Bắt đầu quá trình upload từ Drive URL:", driveUrl);
    try {
      console.log("Getting upload key...");
      const uploadKey = await this.getUploadKey();
      console.log("Đã nhận upload key:", uploadKey);

      console.log("Uploading file...");
      const uploadResponse = await this.uploadFile(driveUrl, uploadKey);
      console.log("Kết quả upload:", uploadResponse);

      if (uploadResponse.code !== 1) {
        throw new Error(`Upload failed with code ${uploadResponse.code}`);
      }

      console.log("Getting video details...");
      const videoDetails = await this.getVideoDetails(uploadResponse.did);
      console.log("Chi tiết video:", videoDetails);

      const videoUrl = `https://helvid.net/play/index/${videoDetails.vid}`;
      console.log("URL video cuối cùng:", videoUrl);

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
      console.error("Upload process failed:", {
        message: error.message,
        stack: error.stack,
        driveUrl: driveUrl,
      });
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
