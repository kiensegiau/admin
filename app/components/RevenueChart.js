'use client';

import { useEffect, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

const options = {
  responsive: true,
  maintainAspectRatio: false,
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

const labels = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6'];

const data = {
  labels,
  datasets: [
    {
      label: 'Doanh thu (triệu VNĐ)',
      data: [12, 19, 3, 5, 2, 3].map(value => value * 1000000),
      backgroundColor: 'rgba(53, 162, 235, 0.5)',
    },
  ],
};

export default function RevenueChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-[400px] flex items-center justify-center">
        <div className="text-gray-400">Đang tải biểu đồ...</div>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px]">
      <Bar options={options} data={data} />
    </div>
  );
}