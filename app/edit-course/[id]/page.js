"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  Collapse,
  Button,
  Modal,
  Form,
  Input,
  message,
  Popconfirm,
  Table,
  Tooltip,
  Tag,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  FileOutlined,
  FileImageOutlined,
} from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import EditCourseInfoModal from "./EditCourseInfoModal";

const { Panel } = Collapse;

const FILE_TYPES = {
  VIDEO: ["mp4", "webm", "ogg"],
  DOCUMENT: ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"],
  IMAGE: ["jpg", "jpeg", "png", "gif"],
};

const getFileType = (url) => {
  try {
    const extension = url.split(".").pop().toLowerCase();
    if (FILE_TYPES.VIDEO.includes(extension)) return "video";
    if (FILE_TYPES.DOCUMENT.includes(extension)) return "document";
    if (FILE_TYPES.IMAGE.includes(extension)) return "image";
    return "other";
  } catch (error) {
    return "other";
  }
};

const validateFileUrl = (url) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("drive.google.com")) {
      if (url.includes("view?usp=sharing")) {
        return url.replace("view?usp=sharing", "preview");
      }
    }
    return url;
  } catch (error) {
    throw new Error("URL không hợp lệ");
  }
};

const getViewUrl = (url) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes("drive.google.com")) {
      let fileId = "";

      if (url.includes("/file/d/")) {
        fileId = url.split("/file/d/")[1].split("/")[0];
      } else if (url.includes("id=")) {
        fileId = new URLSearchParams(urlObj.search).get("id");
      } else {
        const match = url.match(/[-\w]{25,}/);
        if (match) {
          fileId = match[0];
        }
      }

      if (fileId) {
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    }
    return url;
  } catch (error) {
    console.error("Lỗi khi xử lý URL:", error);
    return url;
  }
};

const getProxyUrl = (driveUrl) => {
  try {
    const urlObj = new URL(driveUrl);
    if (urlObj.hostname.includes("drive.google.com")) {
      let fileId = "";

      if (driveUrl.includes("/file/d/")) {
        fileId = driveUrl.split("/file/d/")[1].split("/")[0];
      } else if (driveUrl.includes("id=")) {
        fileId = new URLSearchParams(urlObj.search).get("id");
      } else {
        const match = driveUrl.match(/[-\w]{25,}/);
        if (match) {
          fileId = match[0];
        }
      }

      if (fileId) {
        // Gọi API để lấy public ID
        return `/api/proxy/get-public-id?driveId=${fileId}`;
      }
    }
    return driveUrl;
  } catch (error) {
    console.error("Lỗi khi xử lý URL:", error);
    return driveUrl;
  }
};

const verifyAndEncryptUrl = async (url) => {
  try {
    // Xác minh URL Google Drive
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes("drive.google.com")) {
      throw new Error("URL phải là link Google Drive");
    }

    let driveId = "";
    if (url.includes("/file/d/")) {
      driveId = url.split("/file/d/")[1].split("/")[0];
    } else if (url.includes("id=")) {
      driveId = new URLSearchParams(urlObj.search).get("id");
    } else {
      const match = url.match(/[-\w]{25,}/);
      if (match) {
        driveId = match[0];
      }
    }

    if (!driveId) {
      throw new Error("Không thể lấy Drive ID từ URL");
    }

    // Mã hóa URL
    const encryptResponse = await fetch("/api/proxy/encrypt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, driveId }),
    });

    if (!encryptResponse.ok) {
      throw new Error("Không thể mã hóa URL");
    }

    const { encryptedUrl } = await encryptResponse.json();
    return { driveId, encryptedUrl };
  } catch (error) {
    throw new Error(error.message || "Lỗi khi xử lý URL");
  }
};

const verifyDriveUrl = (url) => {
  try {
    const urlObj = new URL(url);
    if (!urlObj.hostname.includes("drive.google.com")) {
      throw new Error("URL phải là link Google Drive");
    }

    let driveId = "";
    if (url.includes("/file/d/")) {
      driveId = url.split("/file/d/")[1].split("/")[0];
    } else if (url.includes("id=")) {
      driveId = new URLSearchParams(urlObj.search).get("id");
    } else {
      const match = url.match(/[-\w]{25,}/);
      if (match) {
        driveId = match[0];
      }
    }

    if (!driveId) {
      throw new Error("Không thể lấy Drive ID từ URL");
    }

    return driveId;
  } catch (error) {
    throw new Error(error.message || "URL không hợp lệ");
  }
};

export default function EditCoursePage({ params }) {
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState("");
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editCourseModalVisible, setEditCourseModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    fetchCourse();
  }, [params.id]);

  const fetchCourse = async () => {
    try {
      const response = await fetch(`/api/courses/${params.id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể tải dữ liệu khóa học");
      }

      setCourse(data.course);
    } catch (error) {
      console.error("Lỗi khi lấy dữ liệu:", error);
      message.error(error.message || "Không thể tải dữ liệu khóa học");
    } finally {
      setLoading(false);
    }
  };

  const showModal = (type, chapter = null, lesson = null) => {
    setModalType(type);
    setSelectedChapter(chapter);
    setSelectedLesson(lesson);
    if (type.startsWith("edit")) {
      form.setFieldsValue({
        title: type === "edit-chapter" ? chapter.title : lesson.title,
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();

      if (modalType === "add-file") {
        await handleAddFile(values, selectedChapter, selectedLesson);
        return;
      }

      if (modalType === "edit-file") {
        await handleEditFile(
          values,
          selectedChapter,
          selectedLesson,
          selectedFile
        );
        return;
      }

      let updatedChapters = [...(course.chapters || [])];

      switch (modalType) {
        case "chapter":
          // Thêm chương mới
          updatedChapters.push({
            id: uuidv4(),
            title: values.title,
            lessons: [],
            order: updatedChapters.length + 1,
          });
          break;

        case "lesson":
          // Thêm bài học mới
          updatedChapters = updatedChapters.map((chapter) => {
            if (chapter.id === selectedChapter.id) {
              return {
                ...chapter,
                lessons: [
                  ...(chapter.lessons || []),
                  {
                    id: uuidv4(),
                    title: values.title,
                    files: [],
                    order: (chapter.lessons?.length || 0) + 1,
                  },
                ],
              };
            }
            return chapter;
          });
          break;

        case "edit-chapter":
          // Sửa tên chương
          updatedChapters = updatedChapters.map((chapter) =>
            chapter.id === selectedChapter.id
              ? { ...chapter, title: values.title }
              : chapter
          );
          break;

        case "edit-lesson":
          // Sửa tên bài học
          updatedChapters = updatedChapters.map((chapter) => {
            if (chapter.id === selectedChapter.id) {
              const updatedLessons = chapter.lessons.map((lesson) =>
                lesson.id === selectedLesson.id
                  ? { ...lesson, title: values.title }
                  : lesson
              );
              return { ...chapter, lessons: updatedLessons };
            }
            return chapter;
          });
          break;

        case "add-file":
          // Validate và xử lý URL file
          const validatedUrl = validateFileUrl(values.url);
          const fileType = values.type || getFileType(validatedUrl);

          // Kiểm tra nếu file đã tồn tại trong bài học
          const existingFile = selectedLesson.files?.find(
            (f) => f.url === validatedUrl
          );
          if (existingFile) {
            throw new Error("File này đã tồn tại trong bài học");
          }

          updatedChapters = updatedChapters.map((chapter) => {
            if (chapter.id === selectedChapter.id) {
              const updatedLessons = chapter.lessons.map((lesson) => {
                if (lesson.id === selectedLesson.id) {
                  return {
                    ...lesson,
                    files: [
                      ...(lesson.files || []),
                      {
                        id: uuidv4(),
                        name: values.name,
                        url: validatedUrl,
                        type: fileType,
                        uploadTime: new Date().toISOString(),
                      },
                    ],
                  };
                }
                return lesson;
              });
              return { ...chapter, lessons: updatedLessons };
            }
            return chapter;
          });
          break;

        case "edit-file":
          const newUrl = validateFileUrl(values.url);
          const newType = values.type || getFileType(newUrl);

          // Kiểm tra nếu URL mới đã tồn tại trong các file khác
          if (newUrl !== selectedFile.url) {
            const fileExists = selectedLesson.files?.some(
              (f) => f.url === newUrl && f.id !== selectedFile.id
            );
            if (fileExists) {
              throw new Error("File với URL này đã tồn tại trong bài học");
            }
          }

          updatedChapters = updatedChapters.map((chapter) => {
            if (chapter.id === selectedChapter.id) {
              const updatedLessons = chapter.lessons.map((lesson) => {
                if (lesson.id === selectedLesson.id) {
                  const updatedFiles = lesson.files.map((file) => {
                    if (file.id === selectedFile.id) {
                      return {
                        ...file,
                        name: values.name,
                        url: newUrl,
                        type: newType,
                        updateTime: new Date().toISOString(),
                      };
                    }
                    return file;
                  });
                  return { ...lesson, files: updatedFiles };
                }
                return lesson;
              });
              return { ...chapter, lessons: updatedLessons };
            }
            return chapter;
          });
          break;
      }

      await handleUpdateCourse({
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      setModalVisible(false);
      form.resetFields();
      message.success("Thao tác thành công");
    } catch (error) {
      console.error("Lỗi:", error);
      message.error(error.message || "Có lỗi xảy ra");
    }
  };

  const handleDelete = async (type, chapterId, lessonId = null) => {
    try {
      let updatedChapters = [...course.chapters];

      if (type === "chapter") {
        updatedChapters = updatedChapters.filter(
          (chapter) => chapter.id !== chapterId
        );
      } else if (type === "lesson") {
        updatedChapters = updatedChapters.map((chapter) => {
          if (chapter.id === chapterId) {
            return {
              ...chapter,
              lessons: chapter.lessons.filter(
                (lesson) => lesson.id !== lessonId
              ),
            };
          }
          return chapter;
        });
      }

      await handleUpdateCourse({ chapters: updatedChapters });
      message.success(
        `Xóa ${type === "chapter" ? "chương" : "bài học"} thành công`
      );
    } catch (error) {
      console.error("Lỗi khi xóa:", error);
      message.error(
        `Không thể xóa ${
          type === "chapter" ? "chương" : "bài học"
        }. Vui lòng thử lại`
      );
    }
  };

  const handleDeleteFile = async (chapterId, lessonId, fileId) => {
    try {
      const updatedChapters = course.chapters.map((chapter) => {
        if (chapter.id === chapterId) {
          const updatedLessons = chapter.lessons.map((lesson) => {
            if (lesson.id === lessonId) {
              // Tìm file cần xóa để lấy driveId
              const fileToDelete = lesson.files.find(
                (file) => file.id === fileId
              );
              if (fileToDelete && fileToDelete.driveId) {
                // TODO: Gọi API để xóa file từ Google Drive nếu cần
                console.log("Xóa file từ Drive:", fileToDelete.driveId);
              }

              return {
                ...lesson,
                files: lesson.files.filter((file) => file.id !== fileId),
              };
            }
            return lesson;
          });
          return { ...chapter, lessons: updatedLessons };
        }
        return chapter;
      });

      const response = await fetch(`/api/courses/${params.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...course,
          chapters: updatedChapters,
        }),
      });

      if (!response.ok) {
        throw new Error("Không thể xóa file");
      }

      setCourse({ ...course, chapters: updatedChapters });
      message.success("Đã xóa file thành công");
    } catch (error) {
      console.error("Lỗi khi xóa file:", error);
      message.error(error.message || "Không thể xóa file");
    }
  };

  const handleEditFile = async (values, chapter, lesson, file) => {
    try {
      // Xác minh URL Drive và lấy Drive ID nếu URL thay đổi
      let driveId = file.driveId;
      let proxyUrl = file.proxyUrl;

      if (values.url !== file.url) {
        driveId = verifyDriveUrl(values.url);

        // Mã hóa Drive ID mới
        const encryptResponse = await fetch("/api/proxy/encrypt", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ fileId: driveId }),
          cache: "no-store",
        });

        let responseData;
        try {
          responseData = await encryptResponse.json();
        } catch (e) {
          const textError = await encryptResponse.text();
          throw new Error(textError || "Không thể đọc response từ server");
        }

        if (!encryptResponse.ok) {
          throw new Error(responseData.error || "Không thể mã hóa URL");
        }

        if (!responseData.encryptedId) {
          throw new Error("Không nhận được mã hóa ID từ server");
        }

        proxyUrl = `/api/proxy/files?id=${responseData.encryptedId}`;
      }

      const fileType = values.type || getFileType(values.url);

      const updatedChapters = course.chapters.map((c) => {
        if (c.id === chapter.id) {
          const updatedLessons = c.lessons.map((l) => {
            if (l.id === lesson.id) {
              const updatedFiles = l.files.map((f) => {
                if (f.id === file.id) {
                  return {
                    ...f,
                    name: values.name,
                    url: values.url,
                    proxyUrl,
                    driveId,
                    type: fileType,
                    updateTime: new Date().toISOString(),
                  };
                }
                return f;
              });
              return { ...l, files: updatedFiles };
            }
            return l;
          });
          return { ...c, lessons: updatedLessons };
        }
        return c;
      });

      await handleUpdateCourse({
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      message.success("Đã cập nhật file thành công");
      setModalVisible(false);
      form.resetFields();
    } catch (error) {
      console.error("Lỗi khi cập nhật file:", error);
      message.error(error.message || "Không thể cập nhật file");
    }
  };

  const showFileModal = (type, chapter, lesson, file = null) => {
    setModalType(type);
    setSelectedChapter(chapter);
    setSelectedLesson(lesson);
    setSelectedFile(file);

    if (type === "edit-file" && file) {
      form.setFieldsValue({
        name: file.name,
        url: file.url || "",
        type: file.type || getFileType(file.url),
      });
    } else {
      form.resetFields();
    }
    setModalVisible(true);
  };

  const handleViewFile = (url) => {
    const viewUrl = getViewUrl(url);
    window.open(viewUrl, "_blank");
  };

  const handleAddFile = async (values, chapter, lesson) => {
    try {
      // Xác minh URL Drive và lấy Drive ID
      const driveId = verifyDriveUrl(values.url);
      const fileType = values.type || getFileType(values.url);

      // Mã hóa Drive ID
      const encryptResponse = await fetch("/api/proxy/encrypt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fileId: driveId }),
        cache: "no-store",
      });

      let responseData;
      try {
        responseData = await encryptResponse.json();
      } catch (e) {
        const textError = await encryptResponse.text();
        throw new Error(textError || "Không thể đọc response từ server");
      }

      if (!encryptResponse.ok) {
        throw new Error(responseData.error || "Không thể mã hóa URL");
      }

      if (!responseData.encryptedId) {
        throw new Error("Không nhận được mã hóa ID từ server");
      }

      const proxyUrl = `/api/proxy/files?id=${responseData.encryptedId}`;

      // Thêm file mới với proxy URL
      const updatedChapters = course.chapters.map((c) => {
        if (c.id === chapter.id) {
          const updatedLessons = c.lessons.map((l) => {
            if (l.id === lesson.id) {
              return {
                ...l,
                files: [
                  ...(l.files || []),
                  {
                    id: uuidv4(),
                    name: values.name,
                    url: values.url,
                    proxyUrl,
                    driveId,
                    type: fileType,
                    uploadTime: new Date().toISOString(),
                  },
                ],
              };
            }
            return l;
          });
          return { ...c, lessons: updatedLessons };
        }
        return c;
      });

      await handleUpdateCourse({
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      message.success("Đã thêm file thành công");
      setModalVisible(false);
      form.resetFields();
    } catch (error) {
      console.error("Lỗi khi thêm file:", error);
      message.error(error.message || "Không thể thêm file");
    }
  };

  const renderFileList = (lesson, chapter) => {
    const columns = [
      {
        title: "Tên file",
        dataIndex: "name",
        key: "name",
        render: (text, record) => (
          <div style={{ display: "flex", alignItems: "center" }}>
            {record.type === "video" && (
              <PlayCircleOutlined style={{ marginRight: 8 }} />
            )}
            {record.type === "document" && (
              <FileOutlined style={{ marginRight: 8 }} />
            )}
            {record.type === "image" && (
              <FileImageOutlined style={{ marginRight: 8 }} />
            )}
            {text}
          </div>
        ),
      },
      {
        title: "Loại",
        dataIndex: "type",
        key: "type",
        render: (type) => (
          <Tag
            color={
              type === "video"
                ? "blue"
                : type === "document"
                ? "green"
                : "orange"
            }
          >
            {type.toUpperCase()}
          </Tag>
        ),
      },
      {
        title: "Link",
        key: "url",
        render: (_, record) => (
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              type="link"
              onClick={() => {
                navigator.clipboard.writeText(record.proxyUrl || record.url);
                message.success("Đã sao chép link");
              }}
            >
              Sao chép link
            </Button>
            <Button
              type="link"
              onClick={() =>
                window.open(record.proxyUrl || record.url, "_blank")
              }
            >
              Mở link
            </Button>
          </div>
        ),
      },
      {
        title: "Thao tác",
        key: "action",
        render: (_, record) => (
          <div style={{ display: "flex", gap: 8 }}>
            <Tooltip title="Sửa">
              <Button
                type="text"
                icon={<EditOutlined />}
                onClick={() =>
                  showFileModal("edit-file", chapter, lesson, record)
                }
              />
            </Tooltip>
            <Tooltip title="Xóa">
              <Popconfirm
                title="Bạn có chắc chắn muốn xóa file này?"
                onConfirm={() =>
                  handleDeleteFile(chapter.id, lesson.id, record.id)
                }
                okText="Xóa"
                cancelText="Hủy"
              >
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          </div>
        ),
      },
    ];

    return (
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <h4>Danh sách file</h4>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showFileModal("add-file", chapter, lesson)}
          >
            Thêm file
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={lesson.files || []}
          rowKey="id"
          pagination={false}
        />
      </div>
    );
  };

  const handleUpdateCourse = async (updatedData) => {
    try {
      const response = await fetch("/api/courses/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: course.id,
          courseData: updatedData,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra");
      }

      message.success("Cập nhật thành công");
      await fetchCourse();
    } catch (error) {
      console.error("Lỗi khi cập nhật:", error);
      message.error(error.message || "Không thể cập nhật khóa học");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        Đang tải...
      </div>
    );
  }

  if (!course) {
    return <div>Không tìm thấy khóa học</div>;
  }

  return (
    <div className="p-6">
      <Card
        title={course.title}
        extra={
          <div className="flex gap-2">
            <Button
              icon={<EditOutlined />}
              onClick={() => setEditCourseModalVisible(true)}
            >
              Sửa thông tin
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => showModal("chapter")}
            >
              Thêm chương
            </Button>
          </div>
        }
      >
        <Collapse accordion>
          {course.chapters?.map((chapter, index) => (
            <Panel
              header={
                <div className="flex justify-between items-center">
                  <span>{chapter.title}</span>
                  <div
                    className="flex gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      icon={<PlusOutlined />}
                      onClick={() => showModal("lesson", chapter)}
                    >
                      Thêm bài học
                    </Button>
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => showModal("edit-chapter", chapter)}
                    >
                      Sửa
                    </Button>
                    <Popconfirm
                      title="Bạn có chắc chắn muốn xóa chương này?"
                      onConfirm={() => handleDelete("chapter", chapter.id)}
                      okText="Có"
                      cancelText="Không"
                    >
                      <Button danger icon={<DeleteOutlined />}>
                        Xóa
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              }
              key={chapter.id}
            >
              <Collapse accordion>
                {chapter.lessons?.map((lesson, idx) => (
                  <Panel
                    header={
                      <div className="flex justify-between items-center">
                        <span>{lesson.title}</span>
                        <div
                          className="flex gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Button
                            icon={<EditOutlined />}
                            onClick={() =>
                              showModal("edit-lesson", chapter, lesson)
                            }
                          >
                            Sửa
                          </Button>
                          <Popconfirm
                            title="Bạn có chắc chắn muốn xóa bài học này?"
                            onConfirm={() =>
                              handleDelete("lesson", chapter.id, lesson.id)
                            }
                            okText="Có"
                            cancelText="Không"
                          >
                            <Button danger icon={<DeleteOutlined />}>
                              Xóa
                            </Button>
                          </Popconfirm>
                        </div>
                      </div>
                    }
                    key={lesson.id}
                  >
                    {renderFileList(lesson, chapter)}
                  </Panel>
                ))}
              </Collapse>
            </Panel>
          ))}
        </Collapse>
      </Card>

      <Modal
        title={
          modalType === "chapter"
            ? "Thêm chương mới"
            : modalType === "lesson"
            ? "Thêm bài học mới"
            : modalType === "edit-chapter"
            ? "Sửa tên chương"
            : modalType === "edit-lesson"
            ? "Sửa tên bài học"
            : modalType === "add-file"
            ? "Thêm file mới"
            : "Sửa thông tin file"
        }
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          {["chapter", "lesson", "edit-chapter", "edit-lesson"].includes(
            modalType
          ) ? (
            <Form.Item
              name="title"
              label="Tên"
              rules={[{ required: true, message: "Vui lòng nhập tên" }]}
            >
              <Input />
            </Form.Item>
          ) : (
            <>
              <Form.Item
                name="name"
                label="Tên file"
                rules={[{ required: true, message: "Vui lòng nhập tên file" }]}
              >
                <Input />
              </Form.Item>
              <Form.Item
                name="url"
                label="Link Google Drive"
                rules={[
                  { required: true, message: "Vui lòng nhập link" },
                  { type: "url", message: "Vui lòng nhập link hợp lệ" },
                  {
                    validator: async (_, value) => {
                      if (value) {
                        try {
                          verifyDriveUrl(value);
                        } catch (error) {
                          throw new Error(error.message);
                        }
                      }
                    },
                    message: "URL phải là link Google Drive hợp lệ",
                  },
                ]}
                extra={
                  modalType === "edit-file" && selectedFile?.proxyUrl ? (
                    <div style={{ marginTop: 8 }}>
                      <div>Link proxy hiện tại:</div>
                      <a
                        href={selectedFile.proxyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {selectedFile.proxyUrl}
                      </a>
                    </div>
                  ) : null
                }
              >
                <Input prefix={<LinkOutlined />} />
              </Form.Item>
              <Form.Item
                name="type"
                label="Loại file"
                rules={[{ required: true, message: "Vui lòng chọn loại file" }]}
              >
                <Input />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      <EditCourseInfoModal
        key={course?.id}
        course={course}
        onClose={() => setEditCourseModalVisible(false)}
        onUpdateCourse={handleUpdateCourse}
        isVisible={editCourseModalVisible}
      />
    </div>
  );
}
