'use client';

import { useState } from 'react';

export default function TestUpload() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/upload-to-helvid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ videoUrl: url }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Upload thất bại');
      }

      setResult(data.data);
    } catch (err) {
      console.error('Lỗi:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center mb-6">
          Test Upload Video to Helvid
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label 
              htmlFor="videoUrl" 
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Video URL
            </label>
            <input
              type="text"
              id="videoUrl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Nhập URL video cần upload..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !url}
            className={`w-full py-2 px-4 rounded-md text-white font-medium
              ${loading || !url 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700'
              }`}
          >
            {loading ? 'Đang xử lý...' : 'Upload Video'}
          </button>
        </form>

        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-400 rounded text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-3">
            <h2 className="font-semibold text-lg">Kết quả upload:</h2>
            <div className="bg-green-50 p-3 rounded border border-green-200">
              <p className="mb-2">
                <span className="font-medium">Video URL:</span>{' '}
                <a 
                  href={result.videoUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  {result.videoUrl}
                </a>
              </p>
              <p>
                <span className="font-medium">Original URL:</span>{' '}
                <a 
                  href={result.originalUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline break-all"
                >
                  {result.originalUrl}
                </a>
              </p>
            </div>
            
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-600">
                Debug Info
              </summary>
              <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
                {JSON.stringify(result.debug, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
} 