// lib/proxy.js

import { createProxyMiddleware } from 'http-proxy-middleware';

export const apiProxy = createProxyMiddleware({
  target: 'https://khoahoc.live',
  changeOrigin: true,
  pathRewrite: {
    '^/api/proxy': '',
  },
  onProxyReq: (proxyReq, req, res) => {
    // Thêm headers cần thiết
    proxyReq.setHeader('Content-Type', 'application/json');
    proxyReq.setHeader('X-API-Key', process.env.API_KEY);
  },
});