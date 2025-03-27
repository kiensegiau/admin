"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Đăng nhập với Firebase Auth
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Lấy token mới
      const idToken = await userCredential.user.getIdToken(true);

      // Gửi token đến server để tạo session
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken }),
        credentials: "include", // Cho phép gửi và nhận cookie
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi đăng nhập");
      }

      // Thêm kiểm tra chi tiết
      console.log("Đăng nhập thành công:", data);

      // Đợi để đảm bảo cookie đã được set
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Thử thiết lập cookie từ client-side nếu không tìm thấy session cookie
      console.log("Tất cả cookies hiện tại:", document.cookie);
      if (!document.cookie.includes("session=")) {
        console.log("Thử thiết lập cookie từ client-side...");
        
        // Lưu email vào localStorage để xác thực
        window.localStorage.setItem("auth_email", data.email);
        window.localStorage.setItem("auth_admin", data.isAdmin.toString());
        
        // Đặt một cookie không httpOnly để đánh dấu đã đăng nhập
        document.cookie = `session_client=true; path=/; max-age=${60*60*24*5}`;
      }

      // Kiểm tra cookie đơn giản trước
      const hasCookie = document.cookie.includes("session_check=true") || document.cookie.includes("session_client=true");
      console.log("Session cookie check:", hasCookie);

      if (data.isAdmin) {
        // Nếu đã xác nhận là admin, chuyển hướng ngay
        console.log("Xác nhận admin, chuyển hướng đến trang admin...");
        window.sessionStorage.clear();
        window.localStorage.setItem("isLoggedIn", "true");
        window.location.href = "/";
        toast.success("Đăng nhập thành công");
        return;
      }

      // Tiếp tục kiểm tra session đầy đủ nếu cần
      try {
        const tokenCheck = await fetch("/api/auth/check-token", {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });
        
        const tokenData = await tokenCheck.json();
        console.log("Kết quả kiểm tra token:", tokenData);
        
        if (!tokenCheck.ok || !tokenData.isAuthenticated) {
          console.error("Lỗi phiên đăng nhập:", tokenData);
          // Thử chuyển hướng bất chấp lỗi
          if (data.isAdmin) {
            window.localStorage.setItem("isLoggedIn", "true");
            window.location.href = "/";
            toast.success("Đăng nhập thành công");
            return;
          } else {
            throw new Error("Tài khoản không có quyền truy cập");
          }
        }

        if (data.isAdmin) {
          console.log("Chuyển hướng đến trang admin...");
          
          // Xóa bất kỳ lỗi hoặc trạng thái cũ nào
          window.sessionStorage.clear();
          window.localStorage.setItem("isLoggedIn", "true");
          
          // Sử dụng cách chuyển hướng mạnh hơn
          window.location.href = "/";
          
          // Hiện thông báo thành công
          toast.success("Đăng nhập thành công");
        } else {
          // Log chi tiết hơn để debug
          console.error("Email không khớp với ADMIN_EMAIL:", tokenData.email);
          toast.error("Tài khoản không có quyền truy cập. Vui lòng liên hệ quản trị viên.");
        }
      } catch (error) {
        console.error("Lỗi kiểm tra token:", error);
        // Thử chuyển hướng bất chấp lỗi nếu đăng nhập đã thành công
        if (data.isAdmin) {
          window.localStorage.setItem("isLoggedIn", "true");
          window.location.href = "/";
          toast.success("Đăng nhập thành công");
        } else {
          throw error;
        }
      }
    } catch (error) {
      let errorMessage = "Không thể đăng nhập";

      console.error("Lỗi đăng nhập:", error);

      switch (error.code) {
        case "auth/invalid-email":
          errorMessage = "Email không hợp lệ";
          break;
        case "auth/user-disabled":
          errorMessage = "Tài khoản đã bị khóa";
          break;
        case "auth/user-not-found":
          errorMessage = "Không tìm thấy tài khoản";
          break;
        case "auth/wrong-password":
          errorMessage = "Sai mật khẩu";
          break;
        case "auth/too-many-requests":
          errorMessage = "Quá nhiều lần thử đăng nhập, vui lòng thử lại sau";
          break;
        default:
          errorMessage = error.message;
      }

      console.error("❌ Thông báo lỗi:", errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Đăng nhập Admin
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email"
                disabled={loading}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Mật khẩu
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Mật khẩu"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {loading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
