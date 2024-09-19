import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const data = {
  labels: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'],
  datasets: [
    {
      label: 'Doanh thu',
      data: [12, 19, 3, 5, 2, 3, 9],
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
      text: 'Doanh thu theo ngày',
    },
  },
};

export default function BarChart() {
  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <Bar data={data} options={options} />
    </div>
  );
}