import Link from 'next/link';
import { BellIcon, UserCircleIcon } from '@heroicons/react/24/outline';

export default function Header() {
  return (
    <header className="bg-gray-800 text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <Link href="/dashboard" className="text-xl font-bold">
          Admin Dashboard
        </Link>
        <div className="flex items-center space-x-4">
          <BellIcon className="h-6 w-6 text-gray-300 hover:text-white cursor-pointer" />
          <UserCircleIcon className="h-6 w-6 text-gray-300 hover:text-white cursor-pointer" />
        </div>
      </div>
    </header>
  );
}