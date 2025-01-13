"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, BookOpen, Users, LogOut } from "lucide-react";
import { toast } from "sonner";

const menuItems = [
  {
    href: "/",
    label: "Trang chủ",
    icon: Home,
  },
  {
    href: "/courses",
    label: "Quản lý khóa học",
    icon: BookOpen,
  },
  {
    href: "/users",
    label: "Quản lý người dùng",
    icon: Users,
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    try {
      const response = await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Đăng xuất thất bại");
      }

      toast.success("Đăng xuất thành công");
      router.push("/login");
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
      toast.error("Đăng xuất thất bại");
    }
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
      </div>

      <nav className="flex-1 py-4">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-6 py-3 text-sm transition-colors ${
                pathname === item.href
                  ? "bg-blue-50 text-blue-600 border-r-2 border-blue-600 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-6 py-3 text-sm text-gray-600 hover:bg-gray-50 w-full rounded-md"
        >
          <LogOut size={20} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  );
}
