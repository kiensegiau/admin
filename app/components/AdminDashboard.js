'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Row, Col, Statistic } from 'antd';
import { UserOutlined, VideoCameraOutlined, BookOutlined } from '@ant-design/icons';
import RevenueChart from './RevenueChart';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalCourses: 0,
    totalRevenue: 0
  });

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/monitoring');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      
      <Row gutter={16} className="mb-8">
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Users"
              value={stats.totalUsers}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Courses"
              value={stats.totalCourses}
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="Total Revenue"
              value={stats.totalRevenue}
              prefix="$"
            />
          </Card>
        </Col>
      </Row>

      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Revenue Chart</h2>
        <RevenueChart />
      </div>
    </div>
  );
}
