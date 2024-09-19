import { RxAvatar } from 'react-icons/rx';

export default function Navbar() {
  return (
    <div className="flex justify-between p-4 bg-white">
      <h2 className="font-bold text-2xl">Dashboard</h2>
      <div className="flex items-center">
        <RxAvatar size={30} className="mr-2" />
        <h2>Admin</h2>
      </div>
    </div>
  );
}