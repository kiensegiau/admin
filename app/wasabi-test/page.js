"use client";

import { useState, useRef } from "react";
import { toast } from "react-hot-toast";

export default function WasabiTest() {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState("signedUrl"); // signedUrl hoặc direct
  const [shareLinks, setShareLinks] = useState({});
  const [creatingShareLink, setCreatingShareLink] = useState(false);
  const fileInputRef = useRef(null);

  // Upload sử dụng signed URL
  const uploadWithSignedUrl = async (file) => {
    try {
      // 1. Lấy signed URL từ API
      const response = await fetch("/api/upload-to-wasabi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Lỗi khi lấy URL upload");
      }

      const { uploadUrl, fileUrl, key } = await response.json();

      // 2. Upload file trực tiếp lên Wasabi
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error("Lỗi khi upload file lên Wasabi");
      }

      // 3. Trả về thông tin file đã upload
      return {
        fileUrl,
        key,
        fileName: file.name,
        size: file.size,
        method: "Signed URL",
      };
    } catch (error) {
      console.error("Lỗi khi upload file:", error);
      throw error;
    }
  };

  // Upload trực tiếp qua server
  const uploadDirectly = async (file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("filename", file.name);
      formData.append("folder", "wasabi-test");

      const response = await fetch("/api/upload-to-wasabi/direct", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Lỗi khi upload file");
      }

      const result = await response.json();
      return {
        ...result,
        method: "Direct Upload",
        fileName: result.fileName || file.name,
      };
    } catch (error) {
      console.error("Lỗi khi upload file trực tiếp:", error);
      throw error;
    }
  };

  // Xóa file
  const deleteFile = async (key) => {
    try {
      setDeleting(true);
      const response = await fetch("/api/upload-to-wasabi/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Lỗi khi xóa file");
      }

      await response.json();
      setUploadedFiles((prev) => prev.filter((file) => file.key !== key));

      // Xóa link chia sẻ nếu có
      if (shareLinks[key]) {
        const newShareLinks = { ...shareLinks };
        delete newShareLinks[key];
        setShareLinks(newShareLinks);
      }

      toast.success("Đã xóa file thành công");
    } catch (error) {
      console.error("Lỗi khi xóa file:", error);
      toast.error(error.message || "Không thể xóa file");
    } finally {
      setDeleting(false);
    }
  };

  // Tạo link chia sẻ có thời hạn
  const createShareLink = async (key, expires = 3600) => {
    try {
      setCreatingShareLink(true);
      const response = await fetch(
        `/api/upload-to-wasabi/share?key=${encodeURIComponent(
          key
        )}&expires=${expires}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Lỗi khi tạo link chia sẻ");
      }

      const result = await response.json();

      // Lưu link chia sẻ vào state
      setShareLinks((prev) => ({
        ...prev,
        [key]: {
          url: result.shareUrl,
          expiresAt: result.expiresAt,
          expiresIn: result.expiresIn,
        },
      }));

      toast.success("Đã tạo link chia sẻ thành công");
      return result.shareUrl;
    } catch (error) {
      console.error("Lỗi khi tạo link chia sẻ:", error);
      toast.error(error.message || "Không thể tạo link chia sẻ");
    } finally {
      setCreatingShareLink(false);
    }
  };

  // Xử lý upload file
  const handleUpload = async (e) => {
    e.preventDefault();
    const file = fileInputRef.current.files[0];

    if (!file) {
      toast.error("Vui lòng chọn file để upload");
      return;
    }

    try {
      setUploading(true);

      let result;
      if (selectedMethod === "signedUrl") {
        result = await uploadWithSignedUrl(file);
      } else {
        result = await uploadDirectly(file);
      }

      setUploadedFiles((prev) => [result, ...prev]);
      toast.success(`Đã tải lên thành công: ${file.name}`);
      fileInputRef.current.value = "";
    } catch (error) {
      console.error("Lỗi:", error);
      toast.error(error.message || "Không thể upload file");
    } finally {
      setUploading(false);
    }
  };

  // Định dạng thời gian hết hạn thành chuỗi dễ đọc
  const formatExpiresAt = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Kiểm tra xem link chia sẻ đã hết hạn chưa
  const isShareLinkExpired = (expiresAt) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    return now > expires;
  };

  // Sao chép link vào clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Đã sao chép link vào clipboard"))
      .catch((err) => toast.error("Không thể sao chép: " + err));
  };

  // Xác định thời gian hết hạn link chia sẻ
  const getExpirationTimes = () => [
    { label: "1 giờ", value: 3600 },
    { label: "24 giờ", value: 86400 },
    { label: "7 ngày", value: 604800 },
    { label: "1 phút (để test)", value: 60 },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Test Upload Wasabi S3</h1>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">Upload File</h2>

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Phương thức Upload:
            </label>
            <div className="flex space-x-4">
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  value="signedUrl"
                  checked={selectedMethod === "signedUrl"}
                  onChange={() => setSelectedMethod("signedUrl")}
                  className="mr-1"
                />
                <span>Signed URL (Client Upload)</span>
              </label>
              <label className="inline-flex items-center">
                <input
                  type="radio"
                  value="direct"
                  checked={selectedMethod === "direct"}
                  onChange={() => setSelectedMethod("direct")}
                  className="mr-1"
                />
                <span>Direct Upload (Qua Server)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Chọn File:</label>
            <input
              type="file"
              ref={fileInputRef}
              className="border p-2 w-full rounded"
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 ${
              uploading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {uploading ? "Đang Upload..." : "Upload File"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Danh sách File đã Upload</h2>

        {uploadedFiles.length === 0 ? (
          <p className="text-gray-500">Chưa có file nào được upload</p>
        ) : (
          <div className="space-y-6">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="border rounded-lg p-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-3">
                  <div className="flex-grow">
                    <p className="font-medium break-all">{file.fileName}</p>
                    <p className="text-sm text-gray-500">
                      Key:{" "}
                      <span className="font-mono text-xs break-all">
                        {file.key}
                      </span>
                    </p>
                    <p className="text-sm text-gray-500">
                      Size: {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <p className="text-sm text-gray-500">
                      Method: {file.method}
                    </p>
                  </div>

                  <div className="flex flex-col md:flex-row gap-2">
                    <a
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Xem File
                    </a>
                    <button
                      onClick={() => deleteFile(file.key)}
                      disabled={deleting}
                      className={`px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 ${
                        deleting ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                    >
                      Xóa
                    </button>
                  </div>
                </div>

                {/* Phần chia sẻ link có thời hạn */}
                <div className="mt-4 bg-gray-50 p-3 rounded">
                  <h3 className="font-medium mb-2">Link chia sẻ có thời hạn</h3>

                  {shareLinks[file.key] ? (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-sm text-gray-600">
                          URL chia sẻ:
                        </label>
                        <div className="flex">
                          <input
                            type="text"
                            value={shareLinks[file.key].url}
                            readOnly
                            className="flex-grow border rounded-l px-2 py-1 text-sm font-mono bg-gray-100"
                          />
                          <button
                            onClick={() =>
                              copyToClipboard(shareLinks[file.key].url)
                            }
                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-r hover:bg-blue-700"
                          >
                            Sao chép
                          </button>
                        </div>
                      </div>

                      <div className="text-sm">
                        <p className="text-gray-600">
                          Hết hạn:{" "}
                          {formatExpiresAt(shareLinks[file.key].expiresAt)}
                        </p>
                        <p
                          className={`mt-1 ${
                            isShareLinkExpired(shareLinks[file.key].expiresAt)
                              ? "text-red-600 font-medium"
                              : "text-green-600"
                          }`}
                        >
                          {isShareLinkExpired(shareLinks[file.key].expiresAt)
                            ? "Đã hết hạn"
                            : "Còn hiệu lực"}
                        </p>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() =>
                            createShareLink(
                              file.key,
                              shareLinks[file.key].expiresIn
                            )
                          }
                          disabled={creatingShareLink}
                          className={`px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 ${
                            creatingShareLink
                              ? "opacity-50 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          Tạo lại link
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-500">
                        Chọn thời gian hết hạn và tạo link chia sẻ:
                      </p>

                      <div className="flex flex-wrap gap-2">
                        {getExpirationTimes().map((time) => (
                          <button
                            key={time.value}
                            onClick={() =>
                              createShareLink(file.key, time.value)
                            }
                            disabled={creatingShareLink}
                            className={`px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 ${
                              creatingShareLink
                                ? "opacity-50 cursor-not-allowed"
                                : ""
                            }`}
                          >
                            {time.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
