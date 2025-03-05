import { NextResponse } from "next/server";
import axios from "axios";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export class HelvidUploader {
  static uploadKeyCache = null;
  static uploadKeyTimestamp = null;
  static uploadCount = 0;
  static MAX_UPLOADS_PER_KEY = 10;
  static uploadKeyParams = null;

  constructor() {
    this.client = axios.create({
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "accept-language": "vi",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        origin: "https://helvid.com",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
      },
    });

    // Set cookies
    this.cookies = {
      remember_me:
        "8a0c04e7dcfa0c22a33bbd25b80671ab0ef28fd26efd35472318eddfeff675493c6c0eb71e97030adb28d43dc3016505b13d",
      cscms_user_id: "8a7d4rAiott2tjbykb-hg4xwoccORGTk2AQeQuVTSxTOmg",
      cscms_user_login:
        "43cc%2FWXNl5AmVohVrHFCcGDPCWGvMom5ieZgRxtoFw46TFWhNUs-UYeQU%2FdZn7UPVDzc8xgvg4r9Yyb6FA",
      cf_clearance:
        "ApkKUz83WSjBky58jQ3v3_zeWWAIyJ8eDLelTVYoZKM-1741149178-1.2.1.1-pnCCzbgEp0WBV.7CeK6CSqUz1unalS_mIHC38vWZ_fuFt2S28P9B7Madj0.JucMK2hNRItGj.72dtlTcjCJ_7wNrrPlC.s5B7HAIJsjg0X4ec7uOiNkfQAjg7pffClnNhJ7bUefXuSaZd2iYj9S.bOsvm0Lt6BHzR3rkMDPqAUXajhUCI63kO0s8OK_YCzpHsDFc1aeQVJsCflVNp9dF4TlBoxEjAdbBPdrQBoJXjVX3ZvE0.NK6xzLa7IipEiD1I4aUrU4wFOEqh8O6j7tA99CZzdnGnJWY8Zn5Xw2CmjUjYiZLISbMvYNvMPFK0cSLJ3QdLDjJG7Q.9Lb7zEveUR4iJuglYNo12l09eRNu2T.8v559xQDjsRKp_WqZGY0GEXryfJ6nvfKl3akF.Mxg6wb5huq8yGwLe8J1olziVSY",
    };
  }

  _formatCookies() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  async getMyVideos(options = {}) {
    console.log("=== Bắt đầu lấy danh sách video ===");

    try {
      const params = {
        apikey: "F3ziE0vwcNP2W57i6j1bdk4QjbwNX",
        page: options.page || 1,
        per_page: options.per_page || 50,
        search: options.search || "",
        zt: options.zt || "",
        cid: "15", // Giữ nguyên giá trị cid=15
        mycid: "0", // Cập nhật mycid thành 0 giống như khi upload
        fid: "28", // Cập nhật fid thành 28 giống như khi upload
        sort_field: options.sort_field || "addtime",
        sort_by: options.sort_by || "desc",
      };

      // Tạo URL API với các tham số
      const queryString = Object.keys(params)
        .filter((key) => params[key] !== "")
        .map((key) => `${key}=${encodeURIComponent(params[key])}`)
        .join("&");

      const apiUrl = `https://helvid.com/api/myvideo?${queryString}`;
      console.log("URL API:", apiUrl);

      const response = await this.client.get(apiUrl, {
        headers: {
          cookie: this._formatCookies(),
        },
      });

      console.log("Response status:", response.status);

      if (
        response.status === 200 &&
        response.data &&
        response.data.status === "success"
      ) {
        const videos = response.data.data || [];
        console.log(`Lấy thành công ${videos.length} video`);

        return {
          success: true,
          data: {
            videos: videos,
            pagination: response.data.pagination || {},
            params: params,
          },
        };
      } else {
        console.error("Lỗi khi lấy danh sách video:", response.data);
        return {
          success: false,
          error:
            response.data?.msg || "Lỗi không xác định khi lấy danh sách video",
          data: {
            params: params,
          },
        };
      }
    } catch (error) {
      console.error("Lỗi khi lấy danh sách video:", error.message);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }

      return {
        success: false,
        error: error.message || "Lỗi không xác định",
      };
    }
  }

  async getUploadKey(forceNew = false) {
    // Kiểm tra cache
    const now = Date.now();
    const cacheExpired =
      !HelvidUploader.uploadKeyTimestamp ||
      now - HelvidUploader.uploadKeyTimestamp > 1000 * 60 * 60; // 1 giờ

    const hasCache =
      !forceNew &&
      HelvidUploader.uploadKeyCache &&
      !cacheExpired &&
      HelvidUploader.uploadCount < HelvidUploader.MAX_UPLOADS_PER_KEY;

    console.log("Cache status:", {
      hasCache,
      currentCount: HelvidUploader.uploadCount,
      maxUploads: HelvidUploader.MAX_UPLOADS_PER_KEY,
    });

    if (hasCache) {
      HelvidUploader.uploadCount += 1;
      return {
        key: HelvidUploader.uploadKeyCache,
        params: HelvidUploader.uploadKeyParams,
      };
    }

    // Reset cache
    HelvidUploader.uploadCount = 1;
    HelvidUploader.uploadKeyTimestamp = now;

    console.log("Getting new upload key from server");
    try {
      // Lấy trang upload để lấy cookie
      const uploadPageResponse = await axios.get("https://helvid.com/upload", {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "vi",
          cookie: this._formatCookies(),
        },
      });

      // Chuẩn bị form data đầy đủ - Dùng cid và mycid mà không hard-code
      const formData = new URLSearchParams();
      formData.append("cid", "15");
      formData.append("mycid", "0"); // Cập nhật mycid từ 17 thành 0 theo dữ liệu mẫu
      formData.append("fid", "28"); // Cập nhật fid từ 18 thành 28 theo dữ liệu mẫu
      formData.append("folder_id", "");

      // Log để debug
      console.log("Sending form data:", formData.toString());

      // Lấy upload key
      const keyResponse = await axios.post(
        "https://helvid.com/upload/getkey",
        formData,
        {
          headers: {
            accept: "application/json, text/javascript, */*; q=0.01",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "x-requested-with": "XMLHttpRequest",
            cookie: this._formatCookies(),
            referer: "https://helvid.com/upload",
            origin: "https://helvid.com",
            "cache-control": "no-cache",
            pragma: "no-cache",
            "sec-ch-ua":
              '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          },
        }
      );

      console.log("Key response:", keyResponse.data);

      // Trường hợp 1: Dữ liệu chuẩn như trong ví dụ - status, data, data_param
      if (
        keyResponse.data &&
        keyResponse.data.status === "success" &&
        keyResponse.data.data &&
        typeof keyResponse.data.data === "string" &&
        keyResponse.data.data_param
      ) {
        const key = keyResponse.data.data;
        const params = keyResponse.data.data_param;

        HelvidUploader.uploadKeyCache = key;
        HelvidUploader.uploadKeyParams = params;

        console.log("New upload key cached:", key);
        console.log("Upload params:", JSON.stringify(params));

        return {
          key: key,
          params: params,
        };
      }
      // Trường hợp 2: key trực tiếp trong data.key
      else if (keyResponse.data && keyResponse.data.key) {
        HelvidUploader.uploadKeyCache = keyResponse.data.key;
        HelvidUploader.uploadKeyParams = keyResponse.data.params || {};

        console.log("New upload key cached:", keyResponse.data.key);

        return {
          key: keyResponse.data.key,
          params: keyResponse.data.params || {},
        };
      }
      // Trường hợp 3: data là trực tiếp key (string)
      else if (
        keyResponse.data &&
        typeof keyResponse.data === "string" &&
        keyResponse.data.length > 10
      ) {
        HelvidUploader.uploadKeyCache = keyResponse.data;
        HelvidUploader.uploadKeyParams = {};

        console.log("Using direct string as key:", keyResponse.data);

        return {
          key: keyResponse.data,
          params: {},
        };
      }

      console.error(
        "Invalid key response format:",
        JSON.stringify(keyResponse.data)
      );
      throw new Error("Invalid upload key response");
    } catch (error) {
      console.error("Error getting upload key:", error.message);
      if (error.response) {
        console.error("Response status:", error.response.status);
        console.error("Response data:", error.response.data);
      }
      throw error;
    }
  }

  async uploadFile(driveUrl, uploadKeyData, customFileName = null) {
    console.log("=== Bắt đầu quá trình uploadFile ===");

    if (!driveUrl) {
      return {
        success: false,
        error: "Missing driveUrl",
      };
    }

    if (!uploadKeyData || !uploadKeyData.key) {
      return {
        success: false,
        error: "Missing or invalid uploadKeyData",
      };
    }

    console.log("Sử dụng URL đầy đủ:", driveUrl);
    console.log("Upload key:", uploadKeyData.key);

    try {
      // Tạo URL upload với tất cả tham số cần thiết
      const params = new URLSearchParams();

      // Thêm tất cả các tham số từ uploadKeyParams
      if (uploadKeyData.params) {
        Object.entries(uploadKeyData.params).forEach(([key, value]) => {
          params.append(key, value);
        });
      }

      // Thêm upload key
      params.append("key", uploadKeyData.key);

      const uploadUrl = `https://remote.helvid.com/upload.php?${params.toString()}`;
      console.log("URL Upload mới:", uploadUrl);

      // Chuẩn bị form data
      const formData = new FormData();
      formData.append("videoUrl", driveUrl);

      // Nếu có tên tùy chỉnh, thêm vào form data
      if (customFileName) {
        formData.append("videoName", customFileName);
        console.log("Sử dụng tên tùy chỉnh:", customFileName);
      }

      formData.append("folder_id", "");

      console.log("Form data được gửi:", formData.toString());

      console.log(
        "Đang gửi request và chờ đợi phản hồi (có thể mất đến 5-10 phút)..."
      );

      const uploadResponse = await this.client.post(uploadUrl, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Origin: "https://helvid.com",
          Referer: "https://helvid.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Cookie: this._formatCookies(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 600000, // 10 phút timeout
      });

      console.log("Đã nhận được phản hồi từ server sau khi chờ đợi");
      console.log("Upload response status:", uploadResponse.status);

      // Validate response
      const isValidResponse = this._validateResponse(uploadResponse);
      if (!isValidResponse.valid) {
        console.error("Invalid response:", isValidResponse.error);
        return {
          success: false,
          error: isValidResponse.error,
        };
      }

      console.log("Upload response raw:", uploadResponse.data);
      console.log("Upload response type:", typeof uploadResponse.data);

      // Xử lý response
      let responseData = uploadResponse.data;

      // Kiểm tra nếu response là thành công
      if (
        (typeof responseData === "object" && responseData.code === 1) ||
        (typeof responseData === "object" &&
          responseData.msg === "Video upload complete")
      ) {
        console.log(
          "Upload thành công, kết quả:",
          JSON.stringify(responseData)
        );

        // Lấy DID từ response
        const did = responseData.did;

        console.log("Upload thành công, DID:", did);
        console.log("Chờ 3 giây để Helvid xử lý video...");

        // Đợi 3 giây để Helvid xử lý video
        await new Promise((resolve) => setTimeout(resolve, 3000));

        return {
          success: true,
          data: {
            did,
            msg: responseData.msg || "Upload successful",
          },
        };
      } else {
        console.error("Upload failed:", responseData);
        return {
          success: false,
          error:
            typeof responseData === "object"
              ? responseData.msg || "Unknown error"
              : "Unknown error",
        };
      }
    } catch (error) {
      console.error("Upload error:", error.message);

      if (error.response) {
        console.error("Error response:", error.response.data);
        console.error("Error status:", error.response.status);
        console.error("Error headers:", error.response.headers);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Phương thức thử phương án upload khác
  async _tryAlternativeUpload(driveUrl, uploadKeyData) {
    console.log("=== Thử phương án upload thay thế ===");
    try {
      const uploadKey = uploadKeyData.key;
      const params = uploadKeyData.params || {};

      // URL Upload thay thế - thử API endpoint khác
      const alternativeUrl = "https://helvid.com/api/upload/fromlink";
      console.log("Thử URL upload thay thế:", alternativeUrl);

      // Chuẩn bị form data
      const formData = new URLSearchParams();
      formData.append("url", driveUrl);
      formData.append("key", uploadKey);

      if (params.id) formData.append("uid", params.id);
      if (params.cid) formData.append("cid", params.cid);
      if (params.mycid !== undefined) formData.append("mycid", params.mycid);
      if (params.fid) formData.append("fid", params.fid);

      console.log("Form data thay thế:", formData.toString());

      const response = await axios.post(alternativeUrl, formData, {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://helvid.com",
          Referer: "https://helvid.com/upload",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "vi",
          Cookie: this._formatCookies(),
          "Cache-Control": "no-cache",
        },
        timeout: 120000,
      });

      console.log("Phản hồi thay thế:", JSON.stringify(response.data));

      if (response.data && response.data.success) {
        return {
          success: true,
          data: {
            did: response.data.did || response.data.id,
            code: 1,
            alternativeMethod: true,
            response: response.data,
          },
        };
      } else {
        throw new Error(
          response.data?.msg || "Upload thất bại khi sử dụng phương án thay thế"
        );
      }
    } catch (error) {
      console.error("Lỗi trong phương án upload thay thế:", error.message);
      if (error.response) {
        console.error("Status:", error.response.status);
        console.error("Data:", error.response.data);
      }

      return {
        success: false,
        error: "Cả hai phương án upload đều thất bại: " + error.message,
        alternativeAttempted: true,
      };
    }
  }

  // Hàm mới để lấy video ID từ URL đã tồn tại
  async getVideoIdFromUrl(driveUrl) {
    try {
      // Nếu là URL Google Drive, trích xuất ID trực tiếp từ URL
      if (driveUrl && driveUrl.includes("drive.google.com")) {
        console.log("Trích xuất ID từ URL Google Drive:", driveUrl);

        // Mẫu 1: https://drive.google.com/file/d/ID/view?usp=sharing
        let match = driveUrl.match(/\/file\/d\/([^\/]+)/);
        if (match && match[1]) {
          console.log("Tìm thấy ID Google Drive:", match[1]);
          return match[1];
        }

        // Mẫu 2: https://drive.google.com/open?id=ID
        match = driveUrl.match(/[?&]id=([^&]+)/);
        if (match && match[1]) {
          console.log("Tìm thấy ID Google Drive:", match[1]);
          return match[1];
        }

        // Không tìm thấy ID từ URL
        console.error("Không thể trích xuất ID từ URL Google Drive:", driveUrl);
        return null;
      }

      // Nếu không phải URL Google Drive, thử tìm qua API
      console.log("Tìm video qua API với URL:", driveUrl);
      try {
        const response = await this.client.post(
          "https://helvid.com/api/search",
          new URLSearchParams({
            q: driveUrl,
          }).toString(),
          {
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              cookie: this._formatCookies(),
            },
          }
        );

        if (
          response.data &&
          response.data.data &&
          response.data.data.length > 0
        ) {
          console.log("Tìm thấy video qua API:", response.data.data[0].id);
          return response.data.data[0].id;
        }
      } catch (apiError) {
        console.error("Lỗi khi tìm video qua API:", apiError.message);
      }

      // Trả về URL ban đầu nếu không thể tìm thấy ID
      console.log("Không tìm thấy ID, sử dụng URL ban đầu");
      return driveUrl;
    } catch (error) {
      console.error("Lỗi khi tìm video:", error.message);
      // Trong trường hợp lỗi, trả về URL ban đầu
      return driveUrl;
    }
  }

  // Thêm phương thức mới để upload nhiều file song song
  async uploadMultipleFiles(driveUrls) {
    console.log(`=== Bắt đầu upload ${driveUrls.length} files ===`);
    const results = [];

    for (let i = 0; i < driveUrls.length; i++) {
      const driveUrl = driveUrls[i];
      console.log(`Uploading file ${i + 1}/${driveUrls.length}: ${driveUrl}`);

      try {
        const result = await this.uploadFromDrive(driveUrl);
        results.push({
          driveUrl,
          success: result.success,
          data: result.data,
          error: result.error,
        });

        // Thêm thời gian chờ giữa các lần upload để tránh quá tải
        if (i < driveUrls.length - 1) {
          console.log("Chờ 2 giây trước khi upload file tiếp theo...");
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`Error uploading file ${i + 1}:`, error);
        results.push({
          driveUrl,
          success: false,
          error: error.message || "Upload thất bại",
        });
      }
    }

    return results;
  }

  async getVideoDetails(did) {
    console.log("=== Bắt đầu lấy thông tin video ===");
    console.log("DID:", did);

    try {
      // Sử dụng API myvideo để lấy danh sách và tìm video với DID tương ứng
      const apiUrl = `https://helvid.com/api/myvideo?apikey=F3ziE0vwcNP2W57i6j1bdk4QjbwNX&per_page=50`;
      console.log("URL API lấy thông tin video:", apiUrl);

      const response = await this.client.get(apiUrl, {
        headers: {
          cookie: this._formatCookies(),
        },
      });

      console.log("Response status:", response.status);

      if (
        response.status === 200 &&
        response.data &&
        response.data.status === "success"
      ) {
        const videos = response.data.data || [];
        console.log(`Đã lấy được ${videos.length} video từ API`);

        // Tìm video theo DID
        const video = videos.find((v) => v.id === did);

        if (video) {
          console.log("Đã tìm thấy video với DID:", did);
          console.log("Thông tin video:", video.name);

          return {
            success: true,
            data: {
              id: video.id,
              vid: video.vid,
              name: video.name,
              duration: video.duration,
              size: video.size,
              videoUrl: `https://helvid.net/play/index/${video.vid}`,
              embedUrl: `https://helvid.net/play/embed/${video.vid}`,
              fullData: video,
            },
          };
        } else {
          console.log("Không tìm thấy video với DID:", did);
          console.log("Thử chờ 3 giây và tìm lại...");

          // Đôi khi video mới upload cần thời gian để xuất hiện trong danh sách
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // Thử lại lần nữa
          const retryResponse = await this.client.get(apiUrl, {
            headers: {
              cookie: this._formatCookies(),
            },
          });

          if (
            retryResponse.status === 200 &&
            retryResponse.data &&
            retryResponse.data.status === "success"
          ) {
            const retryVideos = retryResponse.data.data || [];
            const retryVideo = retryVideos.find((v) => v.id === did);

            if (retryVideo) {
              console.log(
                "Đã tìm thấy video sau khi thử lại:",
                retryVideo.name
              );

              return {
                success: true,
                data: {
                  id: retryVideo.id,
                  vid: retryVideo.vid,
                  name: retryVideo.name,
                  duration: retryVideo.duration,
                  size: retryVideo.size,
                  videoUrl: `https://helvid.net/play/index/${retryVideo.vid}`,
                  embedUrl: `https://helvid.net/play/embed/${retryVideo.vid}`,
                  fullData: retryVideo,
                },
              };
            } else {
              throw new Error(
                `Không tìm thấy video với DID: ${did} sau khi thử lại`
              );
            }
          }
        }
      }

      console.error("Không thể lấy thông tin video từ API");
      return {
        success: false,
        error: "Không thể lấy thông tin video từ API",
        did: did,
      };
    } catch (error) {
      console.error("Chi tiết lỗi:", {
        message: error.message,
        responseData: error.response?.data,
        status: error.response?.status,
        did: did,
      });

      return {
        success: false,
        error: error.message || "Không thể lấy thông tin video",
        did: did,
      };
    }
  }

  async uploadFromDrive(driveUrl, customFileName = null) {
    console.log("=== Bắt đầu upload file ===");
    console.log("Drive URL:", driveUrl);
    if (customFileName) {
      console.log("Tên tùy chỉnh:", customFileName);
    }

    try {
      // Lấy upload key
      const uploadKeyData = await this.getUploadKey();
      if (!uploadKeyData || !uploadKeyData.key) {
        throw new Error("Không thể lấy upload key");
      }

      console.log("Đã lấy được upload key:", uploadKeyData.key);
      console.log("Các tham số upload:", JSON.stringify(uploadKeyData.params));

      // Gọi hàm uploadFile với tên tùy chỉnh nếu có
      const uploadResult = await this.uploadFile(
        driveUrl,
        uploadKeyData,
        customFileName
      );

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || "Upload thất bại");
      }

      console.log(
        "Upload thành công, kết quả:",
        JSON.stringify(uploadResult.data)
      );

      // Upload thành công, lấy thông tin video
      const did = uploadResult.data.did;
      console.log("Upload thành công, DID:", did);

      // Chờ một lúc để Helvid xử lý video
      console.log("Chờ 3 giây để Helvid xử lý video...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        const videoDetails = await this.getVideoDetails(did);

        if (!videoDetails.success) {
          console.log(
            "Không thể lấy thông tin video, nhưng upload đã thành công"
          );
          return {
            success: true,
            data: {
              id: did,
              message:
                "Video đã được upload nhưng không thể lấy thông tin chi tiết",
              rawResponse: uploadResult.data,
            },
          };
        }

        return {
          success: true,
          data: videoDetails.data,
        };
      } catch (detailsError) {
        console.error("Lỗi khi lấy thông tin video:", detailsError);
        return {
          success: true,
          data: {
            id: did,
            message:
              "Video đã được upload nhưng không thể lấy thông tin chi tiết",
            error: detailsError.message,
            rawResponse: uploadResult.data,
          },
        };
      }
    } catch (error) {
      console.error("Upload process failed:", {
        message: error.message,
        driveUrl: driveUrl,
        response: error.response?.data,
      });

      return {
        success: false,
        error: error.message || "Upload thất bại",
      };
    }
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { driveUrl, driveUrls, action, options } = body;
    const uploader = new HelvidUploader();

    // Xử lý action lấy danh sách video
    if (action === "getMyVideos") {
      console.log("Nhận request lấy danh sách video");
      const result = await uploader.getMyVideos(options || {});
      return NextResponse.json(result);
    }

    // Xử lý upload nhiều file
    if (driveUrls && Array.isArray(driveUrls)) {
      console.log(`Nhận request upload ${driveUrls.length} files`);
      const results = await uploader.uploadMultipleFiles(driveUrls);
      return NextResponse.json({
        success: true,
        totalFiles: driveUrls.length,
        results: results,
      });
    }

    // Xử lý upload một file
    if (!driveUrl) {
      return NextResponse.json({ error: "Missing drive URL" }, { status: 400 });
    }

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
