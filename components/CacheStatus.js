'use client';
import { useState, useEffect } from 'react';
import CacheMonitor from '@/lib/cache-monitor';

export default function CacheStatus({ videoId }) {
  const [cacheInfo, setCacheInfo] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const checkCache = async () => {
      const result = await CacheMonitor.checkCacheStatus(videoId);
      setCacheInfo(result.cache);
      
      const cacheStats = await CacheMonitor.getCacheStats(videoId);
      setStats(cacheStats);
    };

    checkCache();
  }, [videoId]);

  if (!cacheInfo) return null;

  return (
    <div className="bg-gray-100 p-4 rounded-lg">
      <h3 className="font-bold">Cache Status</h3>
      
      <div className="mt-2">
        <p>Served from: {cacheInfo.location}</p>
        <p>Cloudflare: {cacheInfo.cloudflare}</p>
        <p>NGINX: {cacheInfo.nginx}</p>
      </div>

      {stats && (
        <div className="mt-4">
          <h4 className="font-semibold">Cache Statistics</h4>
          <p>Cloudflare Hit Rate: {stats.efficiency.cloudflare.toFixed(2)}%</p>
          <p>NGINX Hit Rate: {stats.efficiency.nginx.toFixed(2)}%</p>
          <p>Total Requests: {stats.totalRequests}</p>
        </div>
      )}
    </div>
  );
} 