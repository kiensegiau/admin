"use client";

import { useState } from "react";

export default function TestHelvid() {
  const [activeTab, setActiveTab] = useState("uploader");

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-8 text-center">
        Test Helvid Uploader
      </h1>

      <div className="w-full mb-8">
        <div className="flex border-b border-gray-200">
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === "uploader"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-blue-500"
            }`}
            onClick={() => setActiveTab("uploader")}
          >
            Helvid Uploader
          </button>
          <button
            className={`py-2 px-4 font-medium ${
              activeTab === "upload-to-helvid"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-500 hover:text-blue-500"
            }`}
            onClick={() => setActiveTab("upload-to-helvid")}
          >
            Upload To Helvid
          </button>
        </div>
      </div>

      {activeTab === "uploader" && <HelvidUploaderTest />}
      {activeTab === "upload-to-helvid" && <UploadToHelvidTest />}
    </div>
  );
}

function HelvidUploaderTest() {
  const [driveUrl, setDriveUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/helvid-uploader", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driveUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
        <p className="text-yellow-800">
          API <code>/api/helvid-uploader</code> sử dụng API{" "}
          <code>remote.helvid.com</code> để tải video trực tiếp từ Google Drive
          lên Helvid.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-2">Drive URL:</label>
          <input
            type="text"
            value={driveUrl}
            onChange={(e) => setDriveUrl(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Paste Google Drive URL here"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400"
        >
          {loading ? "Đang tải lên..." : "Tải lên"}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          Lỗi: {error}
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-100 rounded">
          <h2 className="font-bold mb-2">Kết quả:</h2>
          <pre className="whitespace-pre-wrap overflow-auto max-h-80 p-2 bg-white rounded">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function UploadToHelvidTest() {
  const [videoUrl, setVideoUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [pollingId, setPollingId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setProgress("Bắt đầu xử lý...");

    try {
      // Gửi yêu cầu upload
      const response = await fetch("/api/upload-to-helvid", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ videoUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload thất bại");
      }

      setResult(data);
      setProgress("Hoàn thành!");
    } catch (err) {
      setError(err.message);
      setProgress(null);
    } finally {
      setLoading(false);
      if (pollingId) {
        clearInterval(pollingId);
        setPollingId(null);
      }
    }
  };

  const handlePoll = () => {
    // Mô phỏng việc polling trạng thái tiến trình
    const id = setInterval(() => {
      setProgress((prev) => {
        if (prev && prev.includes("%")) {
          const currentPercent = parseInt(prev.match(/(\d+)%/)[1], 10);
          if (currentPercent < 95) {
            return `Đang tải lên: ${currentPercent + 1}%`;
          }
          return prev;
        }
        return "Đang tải lên: 1%";
      });
    }, 500);
    setPollingId(id);
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-blue-800">
          API <code>/api/upload-to-helvid</code> tải video từ Google Drive về
          server trung gian rồi upload lên Helvid. Phương pháp này tối ưu được
          kết nối mạng bằng streaming.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-2">Drive URL:</label>
          <input
            type="text"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="w-full p-2 border rounded"
            placeholder="Paste Google Drive URL here"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400"
          onClick={() => {
            if (!loading) handlePoll();
          }}
        >
          {loading ? "Đang xử lý..." : "Tải và Upload"}
        </button>
      </form>

      {progress && (
        <div className="mt-4 p-4 bg-gray-100 rounded">
          <div className="flex items-center space-x-2">
            {loading && (
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            )}
            <p>{progress}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          Lỗi: {error}
        </div>
      )}

      {result && (
        <div className="mt-4 p-4 bg-green-100 rounded">
          <h2 className="font-bold mb-2">Kết quả:</h2>
          <pre className="whitespace-pre-wrap overflow-auto max-h-80 p-2 bg-white rounded">
            {JSON.stringify(result, null, 2)}
          </pre>

          {result.success && result.data && result.data.url && (
            <div className="mt-4">
              <h3 className="font-semibold mb-2">Video URL:</h3>
              <a
                href={result.data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 underline"
              >
                {result.data.url}
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
