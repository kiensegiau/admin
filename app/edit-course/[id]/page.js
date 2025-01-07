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
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/app/firebase";
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
    // Lấy phần mở rộng từ URL hoặc tên file
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
    // Kiểm tra URL có phải là Google Drive
    if (urlObj.hostname.includes("drive.google.com")) {
      // Chuyển đổi URL view sang URL download nếu cần
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
      // Lấy file ID từ URL
      let fileId = "";

      if (url.includes("/file/d/")) {
        // Format: https://drive.google.com/file/d/[fileId]/view
        fileId = url.split("/file/d/")[1].split("/")[0];
      } else if (url.includes("id=")) {
        // Format: https://drive.google.com/open?id=[fileId]
        fileId = new URLSearchParams(urlObj.search).get("id");
      } else {
        // Tìm ID theo pattern
        const match = url.match(/[-\w]{25,}/);
        if (match) {
          fileId = match[0];
        }
      }

      if (fileId) {
        // Tạo direct download URL
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
      }
    }
    return url;
  } catch (error) {
    console.error("Lỗi khi xử lý URL:", error);
    return url;
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
      const docRef = doc(db, "courses", params.id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const courseData = { id: docSnap.id, ...docSnap.data() };
        setCourse(courseData);
      }
    } catch (error) {
      console.error("Lỗi khi lấy dữ liệu:", error);
      message.error("Không thể tải dữ liệu khóa học");
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
      const docRef = doc(db, "courses", course.id);
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

      await updateDoc(docRef, {
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      message.success("Cập nhật thành công");
      setModalVisible(false);
      fetchCourse();
    } catch (error) {
      console.error("Lỗi khi cập nhật:", error);
      message.error(error.message || "Không thể cập nhật. Vui lòng thử lại");
    }
  };

  const handleDelete = async (type, chapterId, lessonId = null) => {
    try {
      const docRef = doc(db, "courses", course.id);
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

      await updateDoc(docRef, {
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      message.success("Xóa thành công");
      fetchCourse();
    } catch (error) {
      console.error("Lỗi khi xóa:", error);
      message.error("Không thể xóa. Vui lòng thử lại");
    }
  };

  const handleDeleteFile = async (chapterId, lessonId, driveFileId) => {
    try {
      if (!driveFileId) {
        throw new Error("File ID không hợp lệ");
      }

      const docRef = doc(db, "courses", course.id);
      let updatedChapters = [...course.chapters];

      // Tìm chapter
      const chapter = updatedChapters.find((c) => c.id === chapterId);
      if (!chapter) {
        throw new Error("Không tìm thấy chương");
      }

      // Tìm lesson
      const lesson = chapter.lessons.find((l) => l.id === lessonId);
      if (!lesson) {
        throw new Error("Không tìm thấy bài học");
      }

      // Đảm bảo lesson.files là một mảng
      if (!Array.isArray(lesson.files)) {
        lesson.files = [];
      }

      // Kiểm tra file có tồn tại không
      const fileToDelete = lesson.files.find(
        (f) => (f.driveFileId || f.key) === driveFileId
      );
      if (!fileToDelete) {
        throw new Error("Không tìm thấy file cần xóa");
      }

      // Cập nhật chapters
      updatedChapters = updatedChapters.map((c) => {
        if (c.id === chapterId) {
          return {
            ...c,
            lessons: c.lessons.map((l) => {
              if (l.id === lessonId) {
                const updatedFiles = l.files.filter(
                  (f) => (f.driveFileId || f.key) !== driveFileId
                );
                return {
                  ...l,
                  files: updatedFiles,
                };
              }
              return l;
            }),
          };
        }
        return c;
      });

      // Cập nhật database
      await updateDoc(docRef, {
        chapters: updatedChapters,
        updatedAt: new Date().toISOString(),
      });

      message.success("Xóa file thành công");
      fetchCourse();
    } catch (error) {
      console.error("Lỗi khi xóa file:", error);
      message.error(error.message || "Không thể xóa file. Vui lòng thử lại");
    }
  };

  const showFileModal = (type, chapter, lesson, file = null) => {
    setModalType(type);
    setSelectedChapter(chapter);
    setSelectedLesson(lesson);
    setSelectedFile(file);

    if (type === "edit-file") {
      form.setFieldsValue({
        name: file.name,
        url: file.url,
        type: file.type,
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

  const renderFileList = (lesson, chapter) => {
    // Đảm bảo lesson.files là mảng
    if (!Array.isArray(lesson.files)) {
      lesson.files = [];
    }

    // Map dữ liệu cho table
    const dataSource = lesson.files.map((file) => ({
      key: file.driveFileId || file.key,
      driveFileId: file.driveFileId || file.key,
      name: file.name || "Không có tên",
      url: file.url || "",
      type: file.type || getFileType(file.url || ""),
      updateTime:
        file.updateTime || file.uploadTime || new Date().toISOString(),
    }));

    const columns = [
      {
        title: "Tên",
        dataIndex: "name",
        key: "name",
        render: (text, record) => (
          <div className="flex items-center gap-2">
            {record.type === "video" && <PlayCircleOutlined />}
            {record.type === "document" && <FileOutlined />}
            {record.type === "image" && <FileImageOutlined />}
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
                : type === "image"
                ? "purple"
                : "default"
            }
          >
            {type.toUpperCase()}
          </Tag>
        ),
      },
      {
        title: "Ngày cập nhật",
        dataIndex: "updateTime",
        key: "updateTime",
        render: (date) => new Date(date).toLocaleDateString("vi-VN"),
      },
      {
        title: "Thao tác",
        key: "action",
        render: (_, file) => {
          if (!file || !file.driveFileId) {
            console.error("File không hợp lệ:", file);
            return null;
          }

          return (
            <div className="flex gap-2">
              <Tooltip title="Xem">
                <Button
                  icon={<EyeOutlined />}
                  onClick={() => handleViewFile(file.url)}
                  disabled={!file.url}
                />
              </Tooltip>
              <Tooltip title="Sửa">
                <Button
                  icon={<EditOutlined />}
                  onClick={() =>
                    showFileModal("edit-file", chapter, lesson, file)
                  }
                />
              </Tooltip>
              <Tooltip title="Xóa">
                <Popconfirm
                  title="Bạn có chắc chắn muốn xóa file này?"
                  onConfirm={() => {
                    if (!file.driveFileId) {
                      message.error("Không thể xóa file không có ID");
                      return;
                    }
                    handleDeleteFile(chapter.id, lesson.id, file.driveFileId);
                  }}
                  okText="Có"
                  cancelText="Không"
                >
                  <Button danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Tooltip>
            </div>
          );
        },
      },
    ];

    return (
      <div className="p-4">
        <div className="flex justify-between items-center mb-4">
          <h3>Danh sách file</h3>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => showFileModal("add-file", chapter, lesson)}
          >
            Thêm file
          </Button>
        </div>
        <Table columns={columns} dataSource={dataSource} pagination={false} />
      </div>
    );
  };

  const handleUpdateCourse = async (updatedData) => {
    try {
      const docRef = doc(db, "courses", course.id);
      await updateDoc(docRef, updatedData);
      setCourse({ ...course, ...updatedData });
      message.success("Cập nhật thông tin khóa học thành công");
    } catch (error) {
      console.error("Lỗi khi cập nhật:", error);
      throw error;
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
        onCancel={() => setModalVisible(false)}
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
                label="Link"
                rules={[
                  { required: true, message: "Vui lòng nhập link" },
                  { type: "url", message: "Vui lòng nhập link hợp lệ" },
                ]}
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
