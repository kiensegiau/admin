"use client";

import React, { useEffect, useState } from "react";
import {
  Layout,
  Button,
  Table,
  Card,
  Space,
  Typography,
  message,
  Modal,
  Input,
  Row,
  Col,
  Form,
  InputNumber,
  Tooltip,
  Badge,
  Progress,
  Tag,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  SaveOutlined,
  CloseOutlined,
  CloudSyncOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import Link from "next/link";

const { Title, Text } = Typography;
const { Content } = Layout;
const { confirm } = Modal;
const { Search } = Input;

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form] = Form.useForm();

  // Thêm các state cho Drive URL modal
  const [driveUrlModalVisible, setDriveUrlModalVisible] = useState(false);
  const [currentCourseId, setCurrentCourseId] = useState(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [checkLoading, setCheckLoading] = useState(false);
  const [driveUrlModalForm] = Form.useForm();

  // Thêm state để theo dõi quá trình đồng bộ hàng loạt
  const [batchSyncLoading, setBatchSyncLoading] = useState(false);
  const [batchSyncProgress, setBatchSyncProgress] = useState({
    current: 0,
    total: 0,
    currentCourse: null,
    results: [],
  });

  useEffect(() => {
    fetchCourses();
  }, []);

  const fetchCourses = async () => {
    try {
      const response = await fetch("/api/courses");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể tải danh sách khóa học");
      }

      // Kiểm tra dữ liệu nhận được
      console.log("Dữ liệu khóa học từ API:", data.courses);

      // Đảm bảo tất cả các trường đều có giá trị
      const formattedCourses = data.courses.map((course) => ({
        ...course,
        price: course.price || 0,
        teacher: course.teacher || "",
      }));

      setCourses(formattedCourses);
      setFilteredCourses(formattedCourses);
    } catch (error) {
      console.error("Error fetching courses:", error);
      message.error("Không thể tải danh sách khóa học");
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return "0";
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const handleSearch = (value) => {
    setSearchText(value);

    if (!value || value.trim() === "") {
      setFilteredCourses(courses);
      return;
    }

    const lowercasedQuery = value.toLowerCase().trim();
    const results = courses.filter(
      (course) =>
        (course.title &&
          course.title.toLowerCase().includes(lowercasedQuery)) ||
        (course.description &&
          course.description.toLowerCase().includes(lowercasedQuery)) ||
        (course.teacher &&
          course.teacher.toLowerCase().includes(lowercasedQuery)) ||
        (course.price && course.price.toString().includes(lowercasedQuery))
    );

    setFilteredCourses(results);
  };

  const handleDelete = async (id, title) => {
    confirm({
      title: "Xác nhận xóa khóa học",
      content: `Bạn có chắc chắn muốn xóa khóa học "${title}" không?`,
      okText: "Xóa",
      okType: "danger",
      cancelText: "Hủy",
      async onOk() {
        try {
          setLoading(true);
          const response = await fetch("/api/courses/delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ courseId: id }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || "Có lỗi xảy ra");
          }

          message.success("Xóa khóa học thành công");
          await fetchCourses();
        } catch (error) {
          console.error("Lỗi khi xóa:", error);
          message.error(
            error.message || "Không thể xóa khóa học. Vui lòng thử lại sau."
          );
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const startEditing = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      price: record.price || 0,
      teacher: record.teacher || "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    form.resetFields();
  };

  const saveEdit = async (record) => {
    try {
      if (!record || !record.id) {
        message.error("Vui lòng chọn khóa học để cập nhật");
        return;
      }

      const values = await form.validateFields();
      setLoading(true);

      // Đơn giản hóa dữ liệu gửi đi, chỉ gửi những trường cần thiết
      const updateData = {
        courseId: record.id,
        price: values.price,
        teacher: values.teacher,
      };

      console.log("Dữ liệu gửi đi (đơn giản hóa):", updateData);

      const response = await fetch("/api/courses/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();
      console.log("Phản hồi từ server:", data);

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra");
      }

      message.success("Cập nhật thành công");
      setEditingId(null);
      form.resetFields();
      await fetchCourses();
    } catch (error) {
      console.error("Chi tiết lỗi:", error);
      message.error(
        error.message || "Không thể cập nhật. Vui lòng thử lại sau."
      );
    } finally {
      setLoading(false);
    }
  };

  // Hàm mở modal cập nhật Drive URL
  const openDriveUrlModal = (courseId, existingUrl) => {
    setCurrentCourseId(courseId);
    setDriveUrl(existingUrl || "");
    driveUrlModalForm.setFieldsValue({ driveUrl: existingUrl || "" });
    setDriveUrlModalVisible(true);
  };

  // Hàm lưu Drive URL
  const saveDriveUrl = async () => {
    try {
      const values = await driveUrlModalForm.validateFields();
      setSyncLoading(true);

      const response = await fetch("/api/courses/update-drive-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: currentCourseId,
          driveUrl: values.driveUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi cập nhật Drive URL");
      }

      message.success("Đã cập nhật Drive URL thành công");
      setDriveUrlModalVisible(false);
      await fetchCourses();
    } catch (error) {
      console.error("Lỗi khi cập nhật Drive URL:", error);
      message.error(
        error.message || "Không thể cập nhật Drive URL. Vui lòng thử lại sau."
      );
    } finally {
      setSyncLoading(false);
    }
  };

  // Hàm đồng bộ khóa học từ Drive (đồng bộ một khóa học)
  const syncFromDrive = async (courseId, driveUrl) => {
    try {
      if (!driveUrl) {
        message.error(
          "Chưa có Drive URL. Vui lòng thêm URL trước khi đồng bộ."
        );
        return;
      }

      setSyncLoading(true);
      setCurrentCourseId(courseId);

      const response = await fetch("/api/import-course-from-drive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driveUrl: driveUrl,
          courseId: courseId,
          enableSync: true,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || data.message || "Có lỗi xảy ra khi đồng bộ từ Drive"
        );
      }

      message.success(data.message || "Đồng bộ từ Drive thành công");
      await fetchCourses();
    } catch (error) {
      console.error("Lỗi khi đồng bộ từ Drive:", error);
      message.error(
        error.message || "Không thể đồng bộ từ Drive. Vui lòng thử lại sau."
      );
    } finally {
      setSyncLoading(false);
    }
  };

  // Hàm kiểm tra khóa học
  const checkCourse = async (courseId) => {
    try {
      setCheckLoading(true);
      setCurrentCourseId(courseId);

      const response = await fetch("/api/check-course", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: courseId,
          checkWithDrive: true, // Thêm tùy chọn này để kiểm tra với Google Drive
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi kiểm tra khóa học");
      }

      if (
        data.brokenFiles.length > 0 ||
        data.duplicateFiles.length > 0 ||
        data.missingFiles.length > 0
      ) {
        Modal.confirm({
          title: "Kết quả kiểm tra khóa học",
          content: (
            <div>
              <p>Tìm thấy các vấn đề với khóa học:</p>
              <ul>
                {data.brokenFiles.length > 0 && (
                  <li>Số file bị hỏng: {data.brokenFiles.length}</li>
                )}
                {data.duplicateFiles.length > 0 && (
                  <li>Số file trùng lặp: {data.duplicateFiles.length}</li>
                )}
                {data.missingFiles.length > 0 && (
                  <li>Số file thiếu: {data.missingFiles.length}</li>
                )}
              </ul>
              <p>Bạn có muốn sửa chữa các vấn đề này không?</p>
            </div>
          ),
          okText: "Sửa chữa",
          cancelText: "Hủy",
          onOk: () => updateCourse(courseId),
        });
      } else {
        message.success("Khóa học không có vấn đề gì");
      }
    } catch (error) {
      console.error("Lỗi khi kiểm tra khóa học:", error);
      message.error(
        error.message || "Không thể kiểm tra khóa học. Vui lòng thử lại sau."
      );
    } finally {
      setCheckLoading(false);
    }
  };

  // Hàm cập nhật khóa học (sửa các vấn đề)
  const updateCourse = async (courseId) => {
    try {
      setLoading(true);
      const response = await fetch("/api/update-course", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: courseId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi cập nhật khóa học");
      }

      message.success(
        `Đã cập nhật khóa học thành công: Đã xóa ${data.deletedCount} file, cập nhật ${data.updatedCount} file`
      );
      await fetchCourses();
    } catch (error) {
      console.error("Lỗi khi cập nhật khóa học:", error);
      message.error(
        error.message || "Không thể cập nhật khóa học. Vui lòng thử lại sau."
      );
    } finally {
      setLoading(false);
    }
  };

  // Hàm đồng bộ nhiều khóa học
  const batchSyncFromDrive = async () => {
    try {
      // Lọc danh sách khóa học có Drive URL
      const coursesWithDriveUrl = filteredCourses.filter(
        (course) => course.driveUrl
      );

      if (coursesWithDriveUrl.length === 0) {
        message.warning("Không có khóa học nào có Drive URL để đồng bộ");
        return;
      }

      // Hiển thị hộp thoại xác nhận
      confirm({
        title: "Xác nhận đồng bộ nhiều khóa học",
        content: `Bạn sắp đồng bộ ${coursesWithDriveUrl.length} khóa học từ Google Drive. Quá trình này có thể tốn thời gian. Bạn có chắc chắn muốn tiếp tục?`,
        okText: "Đồng bộ ngay",
        cancelText: "Hủy",
        onOk: async () => {
          try {
            // Cập nhật trạng thái
            setBatchSyncLoading(true);
            setBatchSyncProgress({
              current: 0,
              total: coursesWithDriveUrl.length,
              currentCourse: null,
              results: [],
            });

            // Tạo và hiển thị modal thông tin
            const syncModalInstance = Modal.info({
              title: "Đang đồng bộ khóa học",
              content: (
                <div>
                  <p>Đang chuẩn bị đồng bộ các khóa học...</p>
                  <Progress percent={0} status="active" />
                </div>
              ),
              okText: "Đóng",
              maskClosable: false,
              closable: true,
              okButtonProps: { style: { display: "none" } },
            });

            // Xử lý tuần tự từng khóa học
            for (let i = 0; i < coursesWithDriveUrl.length; i++) {
              const course = coursesWithDriveUrl[i];

              // Cập nhật tiến trình
              const currentProgress = {
                current: i + 1,
                total: coursesWithDriveUrl.length,
                currentCourse: course,
                results: batchSyncProgress.results,
              };

              setBatchSyncProgress(currentProgress);

              // Cập nhật modal với tiến trình hiện tại
              const progressPercent = Math.round(
                (currentProgress.current / currentProgress.total) * 100
              );

              syncModalInstance.update({
                title: "Đang đồng bộ khóa học",
                content: (
                  <div>
                    <p>
                      Đang đồng bộ khóa học {currentProgress.current} /{" "}
                      {currentProgress.total}
                    </p>
                    <p>
                      <strong>Đang xử lý:</strong> {course.title}
                    </p>
                    <Progress percent={progressPercent} status="active" />
                    {currentProgress.results.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <h4>Kết quả ({currentProgress.results.length}):</h4>
                        <ul style={{ maxHeight: 200, overflow: "auto" }}>
                          {currentProgress.results.map((result, index) => (
                            <li key={index} style={{ marginBottom: 8 }}>
                              {result.title}:
                              {result.success ? (
                                <Tag color="success" style={{ marginLeft: 8 }}>
                                  Thành công
                                </Tag>
                              ) : (
                                <Tag color="error" style={{ marginLeft: 8 }}>
                                  Lỗi
                                </Tag>
                              )}
                              <div>{result.message}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ),
              });

              try {
                // Gọi API đồng bộ
                const response = await fetch("/api/import-course-from-drive", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    driveUrl: course.driveUrl,
                    courseId: course.id,
                    enableSync: true,
                  }),
                });

                const data = await response.json();

                // Lưu kết quả
                const newResult = {
                  courseId: course.id,
                  title: course.title,
                  success: response.ok && data.success,
                  message:
                    data.message ||
                    (response.ok && data.success
                      ? "Thành công"
                      : data.error || "Lỗi không xác định"),
                };

                const updatedResults = [
                  ...batchSyncProgress.results,
                  newResult,
                ];

                setBatchSyncProgress((prev) => ({
                  ...prev,
                  results: updatedResults,
                }));

                // Cập nhật lại modal với kết quả mới
                syncModalInstance.update({
                  content: (
                    <div>
                      <p>
                        Đang đồng bộ khóa học {currentProgress.current} /{" "}
                        {currentProgress.total}
                      </p>
                      <p>
                        <strong>Đã xử lý:</strong> {course.title}
                      </p>
                      <Progress percent={progressPercent} status="active" />
                      <div style={{ marginTop: 16 }}>
                        <h4>Kết quả ({updatedResults.length}):</h4>
                        <ul style={{ maxHeight: 200, overflow: "auto" }}>
                          {updatedResults.map((result, index) => (
                            <li key={index} style={{ marginBottom: 8 }}>
                              {result.title}:
                              {result.success ? (
                                <Tag color="success" style={{ marginLeft: 8 }}>
                                  Thành công
                                </Tag>
                              ) : (
                                <Tag color="error" style={{ marginLeft: 8 }}>
                                  Lỗi
                                </Tag>
                              )}
                              <div>{result.message}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ),
                });

                if (!response.ok || !data.success) {
                  console.error(
                    `Lỗi khi đồng bộ khóa học ${course.title}:`,
                    data.error || data.message
                  );
                }

                // Đợi 1 giây giữa các lần đồng bộ
                if (i < coursesWithDriveUrl.length - 1) {
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }
              } catch (courseError) {
                console.error(
                  `Lỗi khi đồng bộ khóa học ${course.title}:`,
                  courseError
                );

                // Lưu kết quả lỗi
                const newErrorResult = {
                  courseId: course.id,
                  title: course.title,
                  success: false,
                  message: courseError.message || "Lỗi không xác định",
                };

                const updatedResults = [
                  ...batchSyncProgress.results,
                  newErrorResult,
                ];

                setBatchSyncProgress((prev) => ({
                  ...prev,
                  results: updatedResults,
                }));

                // Cập nhật modal với thông tin lỗi
                syncModalInstance.update({
                  content: (
                    <div>
                      <p>
                        Đang đồng bộ khóa học {currentProgress.current} /{" "}
                        {currentProgress.total}
                      </p>
                      <p>
                        <strong>Lỗi xử lý:</strong> {course.title}
                      </p>
                      <Progress percent={progressPercent} status="active" />
                      <div style={{ marginTop: 16 }}>
                        <h4>Kết quả ({updatedResults.length}):</h4>
                        <ul style={{ maxHeight: 200, overflow: "auto" }}>
                          {updatedResults.map((result, index) => (
                            <li key={index} style={{ marginBottom: 8 }}>
                              {result.title}:
                              {result.success ? (
                                <Tag color="success" style={{ marginLeft: 8 }}>
                                  Thành công
                                </Tag>
                              ) : (
                                <Tag color="error" style={{ marginLeft: 8 }}>
                                  Lỗi
                                </Tag>
                              )}
                              <div>{result.message}</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ),
                });
              }
            }

            // Hoàn thành, cập nhật modal để có nút đóng
            const successCount = batchSyncProgress.results.filter(
              (r) => r.success
            ).length;
            const failCount = batchSyncProgress.results.length - successCount;

            syncModalInstance.update({
              title: "Hoàn thành đồng bộ khóa học",
              content: (
                <div>
                  <p>
                    Đã hoàn thành đồng bộ {batchSyncProgress.total} khóa học
                  </p>
                  <div>
                    <Tag color="success">Thành công: {successCount}</Tag>
                    {failCount > 0 && <Tag color="error">Lỗi: {failCount}</Tag>}
                  </div>
                  <Progress
                    percent={100}
                    status={failCount > 0 ? "exception" : "success"}
                  />
                  <div style={{ marginTop: 16 }}>
                    <h4>Kết quả chi tiết:</h4>
                    <ul style={{ maxHeight: 200, overflow: "auto" }}>
                      {batchSyncProgress.results.map((result, index) => (
                        <li key={index} style={{ marginBottom: 8 }}>
                          {result.title}:
                          {result.success ? (
                            <Tag color="success" style={{ marginLeft: 8 }}>
                              Thành công
                            </Tag>
                          ) : (
                            <Tag color="error" style={{ marginLeft: 8 }}>
                              Lỗi
                            </Tag>
                          )}
                          <div>{result.message}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ),
              okButtonProps: { style: { display: "block" } },
            });

            message.success(
              `Đã hoàn thành đồng bộ ${coursesWithDriveUrl.length} khóa học`
            );

            // Tải lại danh sách khóa học
            await fetchCourses();
          } catch (error) {
            console.error("Lỗi khi đồng bộ nhiều khóa học:", error);
            message.error(`Quá trình đồng bộ gặp lỗi: ${error.message}`);
          } finally {
            setBatchSyncLoading(false);
          }
        },
      });
    } catch (error) {
      console.error("Lỗi khi chuẩn bị đồng bộ hàng loạt:", error);
      message.error(`Lỗi: ${error.message}`);
    }
  };

  const columns = [
    {
      title: "Tên khóa học",
      dataIndex: "title",
      key: "title",
      render: (text) => <Text strong>{text}</Text>,
      width: "25%",
    },
    {
      title: "Giá",
      dataIndex: "price",
      key: "price",
      width: "15%",
      render: (text, record) => {
        const isEditing = record.id === editingId;
        return isEditing ? (
          <Form.Item
            name="price"
            rules={[
              {
                required: true,
                message: "Vui lòng nhập giá!",
              },
            ]}
            style={{ margin: 0 }}
          >
            <InputNumber
              min={0}
              formatter={(value) => formatPrice(value)}
              parser={(value) => value.replace(/\$\s?|(,*)/g, "")}
              style={{ width: "100%" }}
            />
          </Form.Item>
        ) : (
          <Text>{formatPrice(text)} VNĐ</Text>
        );
      },
    },
    {
      title: "Giáo viên",
      dataIndex: "teacher",
      key: "teacher",
      width: "15%",
      render: (text, record) => {
        const isEditing = record.id === editingId;
        return isEditing ? (
          <Form.Item
            name="teacher"
            rules={[
              {
                required: true,
                message: "Vui lòng nhập tên giáo viên!",
              },
            ]}
            style={{ margin: 0 }}
          >
            <Input />
          </Form.Item>
        ) : (
          <Text>{text || "Chưa có thông tin"}</Text>
        );
      },
    },
    {
      title: "Google Drive",
      key: "driveUrl",
      width: "15%",
      render: (_, record) => {
        return (
          <Space>
            {record.driveUrl ? (
              <Badge status="success" text="Đã liên kết" />
            ) : (
              <Badge status="default" text="Chưa liên kết" />
            )}
            <Button
              type={record.driveUrl ? "default" : "primary"}
              icon={<LinkOutlined />}
              onClick={() => openDriveUrlModal(record.id, record.driveUrl)}
            >
              {record.driveUrl ? "Cập nhật URL" : "Thêm URL"}
            </Button>
          </Space>
        );
      },
    },
    {
      title: "Thao tác",
      key: "actions",
      width: "30%",
      align: "center",
      render: (_, record) => {
        const isEditing = record.id === editingId;
        return isEditing ? (
          <Space size="small">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => saveEdit(record)}
            >
              Lưu
            </Button>
            <Button icon={<CloseOutlined />} onClick={cancelEditing}>
              Hủy
            </Button>
          </Space>
        ) : (
          <Space size="small">
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => startEditing(record)}
            >
              Sửa nhanh
            </Button>
            <Link href={`/edit-course/${record.id}`}>
              <Button type="default" icon={<EditOutlined />}>
                Chi tiết
              </Button>
            </Link>
            <Tooltip title="Đồng bộ từ Google Drive">
              <Button
                type="default"
                icon={<CloudSyncOutlined />}
                onClick={() => syncFromDrive(record.id, record.driveUrl)}
                disabled={!record.driveUrl}
                loading={syncLoading && currentCourseId === record.id}
              />
            </Tooltip>
            <Tooltip title="Kiểm tra khóa học">
              <Button
                type="default"
                icon={<CheckCircleOutlined />}
                onClick={() => checkCourse(record.id)}
                loading={checkLoading && currentCourseId === record.id}
              />
            </Tooltip>
            <Button
              type="primary"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record.id, record.title)}
            >
              Xóa
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Content className="p-6 min-h-screen bg-gray-50">
      <Card className="shadow-sm">
        <Row gutter={[16, 16]} className="mb-6">
          <Col xs={24} md={12}>
            <Title level={2} style={{ margin: 0 }}>
              Quản lý khóa học
            </Title>
          </Col>
          <Col xs={24} md={12} className="flex justify-end items-center gap-2">
            <Search
              placeholder="Tìm kiếm theo tên, giá, giáo viên..."
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              onSearch={handleSearch}
              onChange={(e) => e.target.value === "" && handleSearch("")}
              style={{ maxWidth: 400 }}
            />
            <Button
              type="primary"
              icon={<CloudSyncOutlined />}
              size="large"
              onClick={batchSyncFromDrive}
              loading={batchSyncLoading}
              disabled={batchSyncLoading}
            >
              Đồng bộ tất cả
            </Button>
            <Link href="/add-course">
              <Button type="primary" icon={<PlusOutlined />} size="large">
                Thêm khóa học
              </Button>
            </Link>
          </Col>
        </Row>

        <Form form={form} component={false}>
          <Table
            columns={columns}
            dataSource={filteredCourses}
            loading={loading}
            rowKey="id"
            pagination={{
              defaultPageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `Tổng số ${total} khóa học`,
            }}
            bordered
            scroll={{ x: true }}
          />
        </Form>
      </Card>

      {/* Modal nhập Drive URL */}
      <Modal
        title="Google Drive URL"
        open={driveUrlModalVisible}
        onOk={saveDriveUrl}
        onCancel={() => setDriveUrlModalVisible(false)}
        confirmLoading={syncLoading}
        okText="Lưu"
        cancelText="Hủy"
      >
        <Form form={driveUrlModalForm} layout="vertical">
          <Form.Item
            name="driveUrl"
            label="URL thư mục Google Drive"
            rules={[
              {
                required: true,
                message: "Vui lòng nhập URL Google Drive!",
              },
              {
                type: "url",
                message: "Vui lòng nhập URL hợp lệ!",
              },
            ]}
          >
            <Input placeholder="https://drive.google.com/drive/folders/..." />
          </Form.Item>
          <Text type="secondary">
            Nhập URL thư mục Google Drive chứa nội dung khóa học. Hệ thống sẽ tự
            động đồng bộ cấu trúc thư mục và tải các tệp tin về.
          </Text>
        </Form>
      </Modal>
    </Content>
  );
}
