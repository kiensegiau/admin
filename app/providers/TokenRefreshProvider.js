"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL = 4 * 60 * 1000; // Kiểm tra mỗi 4 phút
const TOKEN_EXPIRY_THRESHOLD = 5 * 60 * 1000; // 5 phút trước khi hết hạn

export function TokenRefreshProvider({ children }) {
  const router = useRouter();

  useEffect(() => {
    // Hàm kiểm tra và làm mới token
    const checkAndRefreshToken = async () => {
      try {
        // Gọi API để lấy thông tin token hiện tại
        const response = await fetch("/api/drive/check-token", {
          method: "GET",
        });

        if (!response.ok) {
          throw new Error("Không thể kiểm tra token");
        }

        const data = await response.json();

        // Nếu token sắp hết hạn hoặc đã hết hạn
        if (data.shouldRefresh) {
          console.log("Token Drive sắp hết hạn, đang làm mới...");
          const refreshResponse = await fetch("/api/drive/refresh-token", {
            method: "POST",
          });

          if (!refreshResponse.ok) {
            console.error("Không thể làm mới token Drive");
            return;
          }

          console.log("Đã làm mới token Drive thành công");
        }
      } catch (error) {
        console.error("Lỗi khi kiểm tra/làm mới token Drive:", error);
      }
    };

    // Kiểm tra ngay khi component mount
    checkAndRefreshToken();

    // Thiết lập interval để kiểm tra định kỳ
    const intervalId = setInterval(checkAndRefreshToken, REFRESH_INTERVAL);

    // Cleanup khi component unmount
    return () => clearInterval(intervalId);
  }, []);

  return children;
}
