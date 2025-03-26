"use client";

import { useState, useEffect } from "react";
import {
  Button,
  Input,
  message,
  Layout,
  Typography,
  Card,
  Table,
  Tag,
  Space,
  Progress,
  Tabs,
  Select,
  Tooltip,
  Alert,
  Modal,
  Checkbox,
} from "antd";
import {
  CloudUploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  SyncOutlined,
  FileSearchOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import Header from "../components/Header";

const { Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;
const { TabPane } = Tabs;
const { Option } = Select;

export default function ImportFromDriveSimple() {
  // State chung cho cả hai chế độ
  const [activeTab, setActiveTab] = useState("import");

  // State cho chế độ import
  const [driveUrls, setDriveUrls] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // State cho chế độ kiểm tra và cập nhật
  const [courseId, setCourseId] = useState("");
  const [coursesToCheck, setCoursesToCheck] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(false);
  const [checkResults, setCheckResults] = useState([]);
  const [isCheckingCourse, setIsCheckingCourse] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [detailedStats, setDetailedStats] = useState(null);
  const [driveUrlInput, setDriveUrlInput] = useState("");
  const [isUpdatingDriveUrl, setIsUpdatingDriveUrl] = useState(false);
  const [showDriveUrlModal, setShowDriveUrlModal] = useState(false);
  const [folderNameFromDrive, setFolderNameFromDrive] = useState("");
  const [updateCourseTitleFromDrive, setUpdateCourseTitleFromDrive] =
    useState(false);

  // State cho danh sách khóa học
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [importResults, setImportResults] = useState([]);
  const [checkSteps, setCheckSteps] = useState([]);

  // Khởi tạo autoFixEnabled từ localStorage nếu có, mặc định là true
  const [autoFixEnabled, setAutoFixEnabled] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("autoFixEnabled");
      return saved !== null ? JSON.parse(saved) : true;
    }
    return true;
  });

  const [tokenStatus, setTokenStatus] = useState(null);

  // Lưu giá trị autoFixEnabled vào localStorage khi thay đổi
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("autoFixEnabled", JSON.stringify(autoFixEnabled));
      console.log("Đã lưu autoFixEnabled vào localStorage:", autoFixEnabled);
    }
  }, [autoFixEnabled]);

  // Tải danh sách khóa học đã có
  const loadCourses = async () => {
    try {
      setIsLoadingCourses(true);
      // Tạo một API endpoint mới để lấy danh sách khóa học
      const response = await fetch("/api/courses");
      if (!response.ok) {
        throw new Error("Không thể tải danh sách khóa học");
      }
      const data = await response.json();
      setCoursesToCheck(data.courses || []);
      message.success(`Đã tải ${data.courses.length} khóa học`);
    } catch (error) {
      message.error(`Lỗi: ${error.message}`);
    } finally {
      setIsLoadingCourses(false);
    }
  };

  // Hàm kiểm tra khóa học
  const handleCheck = async () => {
    if (!courseId) {
      message.warning("Vui lòng chọn khóa học");
      return;
    }

    try {
      setIsChecking(true);
      setCheckSteps([{ step: "Đang kiểm tra khóa học", status: "processing" }]);

      console.log(
        "Giá trị autoFixEnabled trước khi gửi request:",
        autoFixEnabled
      );

      // Tạo requestData với tham số autoFix là 1 nếu true để tránh vấn đề khi serialize
      const requestData = {
        courseId,
        checkWithDrive: true,
        autoFix: autoFixEnabled ? 1 : 0, // Dùng số thay vì boolean
      };

      console.log("Request data gửi đi:", JSON.stringify(requestData));

      const response = await fetch("/api/check-course", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Lỗi khi kiểm tra khóa học");
      }

      const data = await response.json();
      console.log("Kết quả kiểm tra khóa học:", data);

      // Cập nhật chi tiết thống kê
      setDetailedStats({
        chaptersCount: data.stats.chaptersCount,
        lessonsCount: data.stats.lessonsCount,
        filesCount: data.stats.filesCount,
        wasabiFiles: data.stats.wasabiFiles,
      });

      // Tạo các bước kiểm tra
      const steps = [];

      // Kiểm tra cấu trúc
      steps.push({
        step: "Kiểm tra cấu trúc khóa học",
        status: data.structureCheck ? "success" : "error",
        message: data.structureCheck
          ? `Tìm thấy ${data.stats.chaptersCount} chương, ${data.stats.lessonsCount} bài học và ${data.stats.filesCount} file`
          : "Có lỗi trong cấu trúc khóa học",
      });

      // Kiểm tra file Wasabi
      if (data.stats.wasabiFiles > 0) {
        const wasabiStatus =
          data.stats.brokenFiles > 0
            ? autoFixEnabled && data.updateResult?.success
              ? "warning"
              : "error"
            : "success";

        let wasabiDescription = `${data.stats.wasabiFiles} file có key Wasabi`;

        if (data.stats.brokenFiles > 0) {
          if (autoFixEnabled && data.updateResult?.success) {
            const totalFixed =
              (data.updateResult.fixedCount || 0) +
              (data.updateResult.reuploadedCount || 0);
            wasabiDescription += `, đã sửa ${totalFixed} file lỗi`;

            if (data.updateResult.reuploadedCount > 0) {
              wasabiDescription += ` (${data.updateResult.reuploadedCount} file đã tải lại từ Drive)`;
            }

            if (data.stats.brokenFiles > totalFixed) {
              wasabiDescription += `, còn ${
                data.stats.brokenFiles - totalFixed
              } file cần xử lý`;
            }
          } else {
            wasabiDescription += `, ${data.stats.brokenFiles} file lỗi cần sửa`;
          }
        }

        steps.push({
          step: "Kiểm tra file trên Wasabi",
          status: wasabiStatus,
          message: wasabiDescription,
        });
      }

      // Kiểm tra trùng lặp
      if (data.stats.duplicates > 0 || data.stats.missingFiles > 0) {
        steps.push({
          step: "Kiểm tra trùng lặp và thiếu thông tin",
          status: "warning",
          message: `Tìm thấy ${data.stats.duplicates} file trùng lặp và ${data.stats.missingFiles} file thiếu thông tin`,
        });
      } else {
        steps.push({
          step: "Kiểm tra trùng lặp và thiếu thông tin",
          status: "success",
          message: "Không có file trùng lặp hoặc thiếu thông tin",
        });
      }

      // Kiểm tra Drive URL
      steps.push({
        step: "Kiểm tra URL Google Drive",
        status: data.hasDriveUrl ? "success" : "warning",
        message: data.hasDriveUrl
          ? `URL Drive: ${data.driveUrl}`
          : "Khóa học chưa có URL Google Drive",
      });

      // Nếu có kiểm tra Drive, thêm bước này
      if (data.driveCheck) {
        steps.push({
          step: "Đồng bộ với Google Drive",
          status: data.driveCheck.success ? "success" : "error",
          message: data.driveCheck.success
            ? `Đã kiểm tra thành công với Drive (${
                data.driveComparison?.summary?.driveFileCount || 0
              } files)`
            : `Lỗi khi kiểm tra với Drive: ${data.driveCheck.error}`,
        });
      }

      setCheckResults(steps);

      const hasBrokenFileAfterFix =
        autoFixEnabled && data.updateResult?.success
          ? data.stats.brokenFiles > data.updateResult.fixedCount
          : data.stats.brokenFiles > 0;

      // Nếu cần cập nhật và không tự động sửa hết tất cả các lỗi,
      // hiển thị hộp thoại xác nhận
      if (data.needsUpdate) {
        Modal.confirm({
          title: "Cập nhật khóa học",
          content: (
            <div>
              <p>Khóa học có vấn đề cần được cập nhật:</p>
              <ul>
                {hasBrokenFileAfterFix && (
                  <li>{data.brokenFiles.length} file bị lỗi</li>
                )}
                {data.stats.duplicates > 0 && (
                  <li>{data.stats.duplicates} file trùng lặp</li>
                )}
                {data.stats.missingFiles > 0 && (
                  <li>{data.stats.missingFiles} file thiếu thông tin</li>
                )}
              </ul>
              <p>Bạn có muốn cập nhật khóa học không?</p>
            </div>
          ),
          onOk: () => handleUpdate(data),
          okText: "Cập nhật",
          cancelText: "Hủy",
        });
      } else if (autoFixEnabled && data.updateResult?.success) {
        message.success(
          `Đã tự động sửa ${data.updateResult.fixedCount} file bị lỗi`
        );
      }
    } catch (error) {
      console.error("Lỗi:", error);
      message.error(`Lỗi khi kiểm tra: ${error.message}`);
      setCheckResults((prevResults) => [
        ...prevResults,
        {
          step: "Lỗi kiểm tra",
          status: "error",
          message: error.message,
        },
      ]);
    } finally {
      setIsChecking(false);
    }
  };

  const handleImport = async () => {
    if (!driveUrls.trim()) {
      message.warning("Vui lòng nhập ít nhất một link Google Drive");
      return;
    }

    // Tách các URL riêng biệt (mỗi URL trên một dòng hoặc ngăn cách bởi dấu phẩy)
    const urls = driveUrls
      .split(/[\n,]/)
      .map((url) => url.trim())
      .filter((url) => url.length > 0);

    if (urls.length === 0) {
      message.warning("Không tìm thấy URL hợp lệ");
      return;
    }

    setIsLoading(true);
    setIsProcessing(true);

    // Khởi tạo kết quả cho mỗi URL
    const initialResults = urls.map((url, index) => ({
      url,
      status: "pending",
      message: "Đang xử lý...",
      progress: 0,
      courseData: null,
    }));

    setResults(initialResults);

    try {
      // Xử lý song song các URL
      const importPromises = urls.map(async (url, index) => {
        try {
          // Cập nhật trạng thái thành "đang xử lý"
          setResults((prev) => {
            const updatedResults = [...prev];
            updatedResults[index] = {
              ...updatedResults[index],
              status: "processing",
              progress: 10,
            };
            return updatedResults;
          });

          const response = await fetch("/api/import-course-from-drive", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ driveUrl: url }),
          });

          // Cập nhật tiến độ
          setResults((prev) => {
            const updatedResults = [...prev];
            updatedResults[index] = {
              ...updatedResults[index],
              progress: 50,
            };
            return updatedResults;
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Lỗi khi import khóa học");
          }

          const data = await response.json();

          // Xử lý dữ liệu trả về
          const courseData = {
            title: data.title,
            description: `Khóa học được import từ Google Drive\n\nCấu trúc khóa học:\n${formatStructure(
              data.structure
            )}`,
          };

          // Cập nhật kết quả thành công
          setResults((prev) => {
            const updatedResults = [...prev];
            updatedResults[index] = {
              ...updatedResults[index],
              status: "success",
              progress: 100,
              message: "Import thành công",
              courseData,
            };
            return updatedResults;
          });

          return { status: "success", url, courseData };
        } catch (error) {
          // Cập nhật kết quả thất bại
          setResults((prev) => {
            const updatedResults = [...prev];
            updatedResults[index] = {
              ...updatedResults[index],
              status: "error",
              progress: 100,
              message: error.message || "Lỗi khi import khóa học",
            };
            return updatedResults;
          });

          return { status: "error", url, error: error.message };
        }
      });

      // Đợi tất cả các promies hoàn thành
      await Promise.all(importPromises);

      // Đếm số lượng thành công và thất bại
      const successCount = results.filter((r) => r.status === "success").length;
      const errorCount = results.filter((r) => r.status === "error").length;

      if (successCount > 0) {
        message.success(`Đã import thành công ${successCount} khóa học`);
      }

      if (errorCount > 0) {
        message.error(`Có ${errorCount} khóa học gặp lỗi khi import`);
      }
    } catch (error) {
      console.error("Lỗi:", error);
      message.error("Có lỗi xảy ra khi xử lý các yêu cầu");
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  // Hàm format cấu trúc thư mục thành text
  const formatStructure = (structure, level = 0) => {
    if (!structure) return "";

    const indent = "  ".repeat(level);
    let result = `${indent}${structure.name}\n`;

    if (structure.children) {
      structure.children.forEach((child) => {
        if (child.type === "folder") {
          result += formatStructure(child, level + 1);
        } else {
          result += `${indent}  - ${child.name}\n`;
        }
      });
    }

    return result;
  };

  // Cột cho bảng kết quả import
  const importColumns = [
    {
      title: "URL",
      dataIndex: "url",
      key: "url",
      ellipsis: true,
      width: "40%",
      render: (text) => <Text ellipsis>{text}</Text>,
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: "20%",
      render: (status) => {
        if (status === "success") {
          return (
            <Tag icon={<CheckCircleOutlined />} color="success">
              Thành công
            </Tag>
          );
        } else if (status === "error") {
          return (
            <Tag icon={<CloseCircleOutlined />} color="error">
              Lỗi
            </Tag>
          );
        } else if (status === "processing") {
          return (
            <Tag icon={<LoadingOutlined />} color="processing">
              Đang xử lý
            </Tag>
          );
        }
        return <Tag color="default">Chờ xử lý</Tag>;
      },
    },
    {
      title: "Tiến trình",
      dataIndex: "progress",
      key: "progress",
      width: "20%",
      render: (progress) => <Progress percent={progress} size="small" />,
    },
    {
      title: "Thông báo",
      dataIndex: "message",
      key: "message",
      ellipsis: true,
      width: "20%",
    },
  ];

  // Cột cho bảng kết quả kiểm tra
  const checkColumns = [
    {
      title: "Bước kiểm tra",
      dataIndex: "step",
      key: "step",
      width: "30%",
    },
    {
      title: "Trạng thái",
      dataIndex: "status",
      key: "status",
      width: "20%",
      render: (status) => {
        if (status === "success") {
          return (
            <Tag icon={<CheckCircleOutlined />} color="success">
              Thành công
            </Tag>
          );
        } else if (status === "error") {
          return (
            <Tag icon={<CloseCircleOutlined />} color="error">
              Lỗi
            </Tag>
          );
        } else if (status === "processing") {
          return (
            <Tag icon={<SyncOutlined spin />} color="processing">
              Đang xử lý
            </Tag>
          );
        } else if (status === "warning") {
          return (
            <Tag icon={<FileSearchOutlined />} color="warning">
              Cảnh báo
            </Tag>
          );
        }
        return <Tag color="default">Chưa kiểm tra</Tag>;
      },
    },
    {
      title: "Kết quả",
      dataIndex: "message",
      key: "message",
      width: "50%",
    },
  ];

  // Hàm đồng bộ với Google Drive
  const handleSyncWithDrive = async (courseId) => {
    if (!courseId) {
      message.warning("Vui lòng chọn khóa học để đồng bộ");
      return;
    }

    try {
      setIsCheckingCourse(true);
      setCheckResults([
        {
          step: "Bắt đầu đồng bộ với Google Drive",
          status: "processing",
          message: "Đang kết nối với Google Drive...",
        },
      ]);

      // Gọi API đồng bộ khóa học
      const response = await fetch("/api/import-course-from-drive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: courseId,
          enableSync: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Lỗi khi đồng bộ với Google Drive");
      }

      const data = await response.json();
      console.log("Kết quả đồng bộ:", data);

      // Cập nhật kết quả các bước đồng bộ
      setCheckResults([
        {
          step: "Đồng bộ với Google Drive",
          status: "success",
          message: `Đã đồng bộ thành công: ${
            data.stats?.totalFiles || 0
          } file được xử lý`,
        },
        {
          step: "Đồng bộ xóa các mục không còn tồn tại",
          status: data.hasRemovedItems ? "success" : "info",
          message: data.hasRemovedItems
            ? `Đã xóa ${
                data.hasRemovedItems?.deletedFilesCount || 0
              } file không còn tồn tại trên Drive`
            : "Không có mục nào cần xóa",
        },
      ]);

      // Thông báo thành công
      message.success("Đã đồng bộ thành công với Google Drive");

      // Sau khi đồng bộ thành công, kiểm tra lại khóa học
      await handleCheck();
    } catch (error) {
      console.error("Lỗi:", error);
      // Cập nhật kết quả lỗi
      setCheckResults([
        {
          step: "Đồng bộ với Google Drive",
          status: "error",
          message: error.message,
        },
      ]);
      message.error(`Lỗi đồng bộ với Google Drive: ${error.message}`);
    } finally {
      setIsCheckingCourse(false);
    }
  };

  // Hàm hiển thị modal cập nhật URL
  const showDriveUrlUpdateModal = () => {
    if (!courseId) {
      message.warning("Vui lòng chọn khóa học");
      return;
    }
    setShowDriveUrlModal(true);
  };

  // Hàm đóng modal
  const handleCancelDriveUrlModal = () => {
    setShowDriveUrlModal(false);
    setDriveUrlInput("");
    setFolderNameFromDrive("");
    setUpdateCourseTitleFromDrive(false);
  };

  // Hàm cập nhật Drive URL cho khóa học
  const saveDriveUrl = async () => {
    if (!courseId) {
      message.warning("Vui lòng chọn khóa học");
      return;
    }

    if (!driveUrlInput.trim()) {
      message.warning("Vui lòng nhập URL Google Drive");
      return;
    }

    try {
      setIsUpdatingDriveUrl(true);

      const response = await fetch("/api/courses/update-drive-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId,
          driveUrl: driveUrlInput.trim(),
          updateTitle: updateCourseTitleFromDrive,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Lỗi khi cập nhật Drive URL");
      }

      const responseData = await response.json();

      if (responseData.titleUpdated) {
        message.success(
          `Đã cập nhật URL Google Drive và tên khóa học thành "${responseData.folderName}"`
        );
      } else {
        message.success("Đã cập nhật URL Google Drive thành công");
      }

      setShowDriveUrlModal(false);
      setDriveUrlInput("");
      setFolderNameFromDrive("");
      setUpdateCourseTitleFromDrive(false);

      // Sau khi cập nhật URL, kiểm tra lại khóa học
      await handleCheck();
    } catch (error) {
      console.error("Lỗi:", error);
      message.error(`Lỗi khi cập nhật Drive URL: ${error.message}`);
    } finally {
      setIsUpdatingDriveUrl(false);
    }
  };

  // Hàm kiểm tra thông tin thư mục từ Drive
  const checkDriveFolderName = async () => {
    if (!driveUrlInput.trim()) {
      message.warning("Vui lòng nhập URL Google Drive");
      return;
    }

    try {
      setIsUpdatingDriveUrl(true);

      // Gọi API để lấy thông tin thư mục Drive
      const response = await fetch("/api/check-drive-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driveUrl: driveUrlInput.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "Không thể lấy thông tin thư mục Drive"
        );
      }

      const data = await response.json();
      setFolderNameFromDrive(data.folderName);
      setUpdateCourseTitleFromDrive(true);

      message.success(`Đã tìm thấy thư mục: "${data.folderName}"`);
    } catch (error) {
      console.error("Lỗi:", error);
      message.error(`Lỗi khi lấy thông tin thư mục: ${error.message}`);
      setFolderNameFromDrive("");
    } finally {
      setIsUpdatingDriveUrl(false);
    }
  };

  // Hàm xử lý cập nhật khóa học
  const handleUpdate = async (checkData) => {
    try {
      setIsUpdating(true);
      setCheckSteps((prevSteps) => [
        ...prevSteps,
        { step: "Đang cập nhật khóa học", status: "processing" },
      ]);

      const response = await fetch("/api/update-course", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId,
          brokenFiles: checkData.brokenFiles || [],
          duplicateFiles: checkData.duplicateFiles || [],
          missingFiles: checkData.missingFiles || [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Lỗi khi cập nhật khóa học");
      }

      const updateData = await response.json();
      console.log("Kết quả cập nhật khóa học:", updateData);

      // Cập nhật bước cuối cùng
      setCheckSteps((prevSteps) => {
        const newSteps = [...prevSteps];
        newSteps[newSteps.length - 1] = {
          step: "Cập nhật khóa học",
          status: "success",
          message: `Đã cập nhật: ${
            updateData.updatedFiles || 0
          } file cập nhật, ${updateData.deletedFiles || 0} file đã xóa`,
        };
        return newSteps;
      });

      message.success(
        `Đã cập nhật khóa học thành công: ${
          updateData.updatedFiles || 0
        } file cập nhật, ${updateData.deletedFiles || 0} file đã xóa`
      );

      // Làm mới kết quả kiểm tra
      await handleCheck();
    } catch (error) {
      console.error("Lỗi khi cập nhật:", error);
      setCheckSteps((prevSteps) => {
        const newSteps = [...prevSteps];
        newSteps[newSteps.length - 1] = {
          step: "Cập nhật khóa học",
          status: "error",
          message: `Lỗi: ${error.message}`,
        };
        return newSteps;
      });
      message.error(`Lỗi cập nhật khóa học: ${error.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // Hàm kiểm tra token Google Drive
  const checkDriveToken = async () => {
    try {
      setTokenStatus({
        checking: true,
        message: "Đang kiểm tra kết nối Google Drive...",
      });

      // Sử dụng API mới để kiểm tra kết nối Drive
      const response = await fetch("/api/check-drive-connection", {
        method: "GET",
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTokenStatus({
          valid: true,
          message: `Kết nối Google Drive thành công! Tài khoản: ${
            data.user?.displayName || "Không xác định"
          } (${data.user?.emailAddress || ""}). Hết hạn: ${new Date(
            data.tokenExpiry
          ).toLocaleString()}`,
          details: data,
        });
        message.success("Kết nối Google Drive thành công");
      } else {
        setTokenStatus({
          valid: false,
          message:
            data.error ||
            "Kết nối Google Drive không thành công. Vui lòng xác thực lại.",
        });
        message.error("Kết nối Google Drive không thành công");

        // Hiển thị hướng dẫn xác thực
        Modal.info({
          title: "Cần xác thực với Google Drive",
          content: (
            <div>
              <p>
                Không thể kết nối tới Google Drive. Bạn cần xác thực để sử dụng
                tính năng tự động tải lại file từ Drive.
              </p>
              <p>Vui lòng:</p>
              <ol>
                <li>
                  Truy cập trang xác thực:{" "}
                  <a href="/api/auth/google" target="_blank">
                    /api/auth/google
                  </a>
                </li>
                <li>Nhấn nút &quot;Xác thực với Google Drive&quot;</li>
                <li>Đăng nhập và cấp quyền cho ứng dụng</li>
                <li>Quay lại trang này và kiểm tra kết nối lại</li>
              </ol>
            </div>
          ),
          okText: "Đã hiểu",
        });
      }
    } catch (error) {
      console.error("Lỗi kiểm tra kết nối:", error);
      setTokenStatus({
        valid: false,
        message: `Lỗi kiểm tra kết nối: ${error.message}`,
      });
      message.error(`Lỗi kiểm tra kết nối: ${error.message}`);
    }
  };

  return (
    <Layout className="min-h-screen">
      <Layout>
        <Header />
        <Content className="p-6">
          <Card className="w-full max-w-4xl mx-auto">
            <Tabs activeKey={activeTab} onChange={setActiveTab}>
              <TabPane tab="Import từ Google Drive" key="import">
                <Title level={3} className="mb-6">
                  Import nhiều khóa học từ Google Drive
                </Title>

                <div className="mb-4">
                  <p className="mb-2">
                    Nhập các link Google Drive (mỗi link một dòng):
                  </p>
                  <TextArea
                    placeholder="https://drive.google.com/...\nhttps://drive.google.com/..."
                    value={driveUrls}
                    onChange={(e) => setDriveUrls(e.target.value)}
                    className="w-full"
                    rows={5}
                    disabled={isLoading}
                  />
                </div>

                <div className="text-gray-500 text-sm mb-4">
                  <p>Lưu ý:</p>
                  <ul className="list-disc pl-4">
                    <li>
                      Mỗi link phải là thư mục Google Drive được chia sẻ công
                      khai
                    </li>
                    <li>
                      Thư mục nên chứa các file video và tài liệu của khóa học
                    </li>
                    <li>
                      Cấu trúc thư mục nên được tổ chức theo chương/bài học
                    </li>
                    <li>
                      Các link có thể nhập mỗi link một dòng hoặc phân cách bằng
                      dấu phẩy
                    </li>
                  </ul>
                </div>

                <Button
                  type="primary"
                  icon={<CloudUploadOutlined />}
                  onClick={handleImport}
                  loading={isLoading}
                  className="mt-2 mb-4"
                  disabled={isProcessing}
                >
                  Import tất cả
                </Button>

                {results.length > 0 && (
                  <div className="mt-4">
                    <Title level={4} className="mb-2">
                      Kết quả import
                    </Title>
                    <Table
                      dataSource={results}
                      columns={importColumns}
                      rowKey="url"
                      pagination={false}
                      size="small"
                    />
                  </div>
                )}
              </TabPane>
              <TabPane tab="Kiểm tra và cập nhật khóa học" key="check">
                <Title level={3} className="mb-6">
                  Kiểm tra và cập nhật khóa học
                </Title>

                <Alert
                  message="Chức năng kiểm tra khóa học"
                  description="Công cụ này sẽ kiểm tra khóa học đã tồn tại để phát hiện các vấn đề: file lỗi trên Wasabi, file trùng lặp, hoặc file bị thiếu. Sau đó hệ thống sẽ tự động sửa chữa những vấn đề tìm thấy."
                  type="info"
                  showIcon
                  className="mb-4"
                />

                <div className="mb-6">
                  <Space>
                    <Button
                      type="default"
                      onClick={loadCourses}
                      loading={isLoadingCourses}
                    >
                      Tải danh sách
                    </Button>
                    <Button
                      type="default"
                      onClick={checkDriveToken}
                      loading={tokenStatus?.checking}
                      icon={<LinkOutlined />}
                    >
                      Kiểm tra token Drive
                    </Button>
                    <Button
                      type="primary"
                      onClick={handleCheck}
                      loading={isChecking}
                      disabled={!courseId}
                    >
                      Kiểm tra
                    </Button>
                    <Tag color="success" icon={<CheckCircleOutlined />}>
                      Tự động tải lại file từ Drive khi lỗi 404: Đã bật
                    </Tag>
                  </Space>
                </div>

                {tokenStatus && (
                  <Alert
                    message={tokenStatus.message}
                    type={tokenStatus.valid ? "success" : "warning"}
                    showIcon
                    style={{ marginTop: 10, marginBottom: 10 }}
                  />
                )}

                {courseId && (
                  <div className="mb-6">
                    <Title level={5}>Cập nhật URL Google Drive</Title>
                    <Button
                      type="primary"
                      onClick={showDriveUrlUpdateModal}
                      icon={<LinkOutlined />}
                    >
                      Cập nhật URL Google Drive
                    </Button>
                    <Text
                      type="secondary"
                      style={{ display: "block", marginTop: "8px" }}
                    >
                      Cập nhật URL Drive để có thể đồng bộ khóa học với Google
                      Drive
                    </Text>

                    <Modal
                      title="Cập nhật URL Google Drive"
                      open={showDriveUrlModal}
                      onOk={saveDriveUrl}
                      onCancel={handleCancelDriveUrlModal}
                      confirmLoading={isUpdatingDriveUrl}
                      okText="Cập nhật"
                      cancelText="Hủy"
                    >
                      <div style={{ marginBottom: "16px" }}>
                        <Input
                          placeholder="Nhập URL thư mục Google Drive"
                          value={driveUrlInput}
                          onChange={(e) => setDriveUrlInput(e.target.value)}
                          style={{ width: "100%", marginBottom: "8px" }}
                          disabled={isUpdatingDriveUrl}
                        />
                        <Button
                          onClick={checkDriveFolderName}
                          loading={isUpdatingDriveUrl}
                          size="small"
                        >
                          Kiểm tra tên thư mục
                        </Button>
                      </div>

                      {folderNameFromDrive && (
                        <div style={{ marginBottom: "16px" }}>
                          <Alert
                            message={`Tên thư mục: &quot;${folderNameFromDrive}&quot;`}
                            type="success"
                            showIcon
                            style={{ marginBottom: "8px" }}
                          />
                          <Checkbox
                            checked={updateCourseTitleFromDrive}
                            onChange={(e) =>
                              setUpdateCourseTitleFromDrive(e.target.checked)
                            }
                          >
                            Cập nhật tên khóa học theo tên thư mục
                          </Checkbox>
                        </div>
                      )}

                      <Text type="secondary">
                        URL phải có dạng:
                        https://drive.google.com/drive/folders/XXXXX hoặc
                        https://drive.google.com/drive/u/0/folders/XXXXX
                      </Text>
                    </Modal>
                  </div>
                )}

                {checkResults.length > 0 && (
                  <div className="mt-4">
                    <Title level={4} className="mb-2">
                      Kết quả kiểm tra
                    </Title>
                    <Table
                      dataSource={checkResults}
                      columns={checkColumns}
                      rowKey="step"
                      pagination={false}
                      size="small"
                    />
                  </div>
                )}

                {detailedStats && (
                  <div className="mt-4">
                    <div className="flex justify-between items-center">
                      <Title level={4} className="mb-2">
                        Thống kê chi tiết
                      </Title>
                      <Button
                        type="link"
                        onClick={() => setShowDetails(!showDetails)}
                      >
                        {showDetails ? "Ẩn chi tiết" : "Hiện chi tiết"}
                      </Button>
                    </div>

                    {showDetails && (
                      <div className="bg-gray-50 p-4 rounded">
                        <Paragraph>
                          <ul className="list-disc pl-4">
                            <li>
                              Tổng số chương:{" "}
                              <b>{detailedStats.chaptersCount}</b>
                            </li>
                            <li>
                              Tổng số bài học:{" "}
                              <b>{detailedStats.lessonsCount}</b>
                            </li>
                            <li>
                              Tổng số file: <b>{detailedStats.filesCount}</b>
                            </li>
                            <li>
                              Số file trên Wasabi:{" "}
                              <b>{detailedStats.wasabiFiles}</b>
                            </li>
                          </ul>
                        </Paragraph>
                      </div>
                    )}
                  </div>
                )}
              </TabPane>
            </Tabs>
          </Card>
        </Content>
      </Layout>
    </Layout>
  );
}
