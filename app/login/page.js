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
    console.log("1. Bắt đầu quá trình đăng nhập...");

    try {
      console.log("2. Đang đăng nhập với Firebase Auth...");
      // Đăng nhập với Firebase Auth
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      console.log(
        "3. Đăng nhập Firebase thành công:",
        userCredential.user.email
      );

      console.log("4. Đang lấy ID token mới...");
      // Lấy token mới
      const idToken = await userCredential.user.getIdToken(true);
      console.log("5. Đã lấy được ID token:", idToken.substring(0, 20) + "...");

      console.log("6. Đang gửi token đến server để tạo session...");
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
      console.log("7. Phản hồi từ server:", data);

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi đăng nhập");
      }

      console.log("8. Đang đợi cookie được set...");
      // Đợi 1 giây để đảm bảo cookie đã được set
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("9. Hoàn tất đợi cookie");

      console.log("10. Chuyển hướng đến trang chủ...");
      router.push("/");
      toast.success("Đăng nhập thành công");
    } catch (error) {
      console.error("❌ Lỗi trong quá trình đăng nhập:", error);
      let errorMessage = "Không thể đăng nhập";

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
        default:
          errorMessage = error.message;
      }

      console.error("❌ Thông báo lỗi:", errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      console.log("11. Kết thúc quá trình đăng nhập");
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
