"use client";

import { useEffect } from "react";

const TOKEN_EXPIRY_THRESHOLD = 5 * 60 * 1000; // 5 phút trước khi hết hạn

export function TokenRefreshProvider({ children }) {
  useEffect(() => {
    let timeoutId;

    // Hàm kiểm tra và làm mới token
    const checkAndRefreshToken = async () => {
      try {
        console.log("Đang kiểm tra token Drive...");
        // Gọi API để lấy thông tin token hiện tại
        const response = await fetch("/api/drive/check-token", {
          method: "GET",
        });

        if (!response.ok) {
          throw new Error("Không thể kiểm tra token");
        }

        const data = await response.json();
        const minutesLeft = Math.round(data.expiresIn / 1000 / 60);
        console.log("Thời gian còn lại của token:", minutesLeft, "phút");

        if (data.shouldRefresh) {
          console.log("Token Drive sắp hết hạn, đang làm mới...");
          const refreshResponse = await fetch("/api/drive/refresh-token", {
            method: "POST",
          });

          if (!refreshResponse.ok) {
            const error = await refreshResponse.json();
            console.error("Không thể làm mới token Drive:", error.error);
            return;
          }

          console.log("Đã làm mới token Drive thành công");

          // Đặt lịch kiểm tra tiếp theo trước khi token mới hết hạn
          const nextCheck = data.expiresIn - TOKEN_EXPIRY_THRESHOLD;
          console.log(
            "Sẽ kiểm tra lại sau:",
            Math.round(nextCheck / 1000 / 60),
            "phút"
          );
          timeoutId = setTimeout(checkAndRefreshToken, nextCheck);
        } else {
          // Token còn hạn, đặt lịch kiểm tra trước khi hết hạn
          const nextCheck = data.expiresIn - TOKEN_EXPIRY_THRESHOLD;
          console.log(
            "Token Drive còn hạn. Sẽ kiểm tra lại sau:",
            Math.round(nextCheck / 1000 / 60),
            "phút"
          );
          timeoutId = setTimeout(checkAndRefreshToken, nextCheck);
        }
      } catch (error) {
        console.error("Lỗi khi kiểm tra/làm mới token Drive:", error);
        // Nếu có lỗi, thử lại sau 5 phút
        timeoutId = setTimeout(checkAndRefreshToken, 5 * 60 * 1000);
      }
    };

    // Kiểm tra lần đầu khi component mount
    checkAndRefreshToken();

    // Cleanup khi component unmount
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  return children;
}
