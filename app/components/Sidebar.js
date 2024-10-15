import Link from 'next/link';
import { HomeIcon, UserGroupIcon, AcademicCapIcon, ChartBarIcon, CogIcon } from '@heroicons/react/24/outline';

const menuItems = [
  { name: 'Dashboard', icon: HomeIcon, href: '/dashboard' },
  { name: 'Người dùng', icon: UserGroupIcon, href: '/users' },
  { name: 'Khóa học', icon: AcademicCapIcon, href: '/courses' },
  { name: 'drive', icon: ChartBarIcon, href: '/import-from-drive' },
  { name: 'Cài đặt', icon: CogIcon, href: '/settings' },
];

export default function Sidebar() {
  return (
    <div className="bg-gray-900 text-gray-300 w-64 space-y-6 py-7 px-2 absolute inset-y-0 left-0 transform -translate-x-full md:relative md:translate-x-0 transition duration-200 ease-in-out">
      <nav>
        {menuItems.map((item) => (
          <Link key={item.name} href={item.href} className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700 hover:text-white">
            <item.icon className="inline-block h-6 w-6 mr-2" />
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}