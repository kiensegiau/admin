import { FaShoppingBag } from 'react-icons/fa';

const orders = [
  { id: 1, name: 'John Doe', status: 'Processing', total: '$300.00' },
  { id: 2, name: 'Jane Smith', status: 'Shipped', total: '$150.00' },
  { id: 3, name: 'Bob Johnson', status: 'Delivered', total: '$200.00' },
];

export default function RecentOrders() {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <h2 className="font-bold text-xl mb-4">Đơn hàng gần đây</h2>
      <ul>
        {orders.map((order) => (
          <li key={order.id} className="bg-gray-50 hover:bg-gray-100 rounded-lg my-3 p-2 flex items-center cursor-pointer">
            <div className="bg-purple-100 rounded-lg p-3">
              <FaShoppingBag className="text-purple-800" />
            </div>
            <div className="pl-4">
              <p className="text-gray-800 font-bold">${order.total}</p>
              <p className="text-gray-400 text-sm">{order.name}</p>
            </div>
            <p className="lg:flex md:hidden absolute right-6 text-sm">{order.status}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}