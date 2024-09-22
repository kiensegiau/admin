'use client';

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("Lỗi được bắt bởi ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          <h2 className="text-lg font-bold mb-2">Đã xảy ra lỗi</h2>
          <p className="mb-2">Chúng tôi xin lỗi vì sự bất tiện này. Vui lòng thử làm mới trang hoặc liên hệ với quản trị viên nếu vấn đề vẫn tiếp tục.</p>
          <details className="mt-2">
            <summary className="cursor-pointer">Chi tiết lỗi</summary>
            <pre className="mt-2 p-2 bg-red-50 rounded text-sm">
              {this.state.error && this.state.error.toString()}
              <br />
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </pre>
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;