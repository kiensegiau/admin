'use client';

import { Layout, Card, Row, Col, Statistic } from 'antd';
import { UserOutlined, BookOutlined, VideoCameraOutlined, DollarOutlined } from '@ant-design/icons';
import { Suspense } from 'react';
import RevenueChart from '../components/RevenueChart';

const { Content } = Layout;

const ChartLoading = () => (
  <div className="w-full h-[400px] flex items-center justify-center">
    <div className="text-gray-400">Đang tải biểu đồ...</div>
  </div>
);

export default function Dashboard() {
  return (
    <Content className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Tổng quan</h1>
        <p className="text-gray-500">Thống kê hoạt động của hệ thống</p>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Tổng số học viên"
              value={1234}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Khóa học"
              value={48}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Video bài giảng"
              value={156}
              prefix={<VideoCameraOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="Doanh thu tháng"
              value={125000000}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#cf1322' }}
              formatter={value => `${value.toLocaleString('vi-VN')} VNĐ`}
            />
          </Card>
        </Col>
      </Row>

      <Card className="mt-6">
        <Suspense fallback={<ChartLoading />}>
          <RevenueChart />
        </Suspense>
      </Card>
    </Content>
  );
}