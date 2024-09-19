import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const data = {
  labels: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'],
  datasets: [
    {
      label: 'Doanh thu',
      data: [12, 19, 3, 5, 2, 3, 10, 15, 8, 12, 20, 25],
      backgroundColor: 'rgba(75, 192, 192, 0.6)',
    },
  ],
};

const options = {
  responsive: true,
  plugins: {
    legend: {
      position: 'top',
    },
    title: {
      display: true,
      text: 'Doanh thu theo tháng',
    },
  },
};

export default function RevenueChart() {
  return (
    <div className="w-full md:w-1/2 xl:w-2/3 px-6 py-4">
      <div className="bg-white rounded-lg shadow-md p-5">
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}