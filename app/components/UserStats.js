export default function UserStats({ title = "Tổng người dùng", value = "1,234" }) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-lg font-semibold text-gray-700 mb-2">{title}</h2>
      <p className="text-3xl font-bold text-gray-800">{value}</p>
    </div>
  );
}