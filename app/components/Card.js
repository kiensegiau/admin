export default function Card({ title, value }) {
    return (
      <div className="bg-white flex justify-between p-4 rounded-lg shadow-md">
        <div>
          <h3 className="font-bold text-lg">{title}</h3>
          <span className="text-2xl">{value}</span>
        </div>
      </div>
    );
  }