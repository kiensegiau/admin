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
  Select,
  Dropdown,
  Menu,
  Divider,
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
  GroupOutlined,
  FilterOutlined,
  SortAscendingOutlined,
  DownOutlined,
} from "@ant-design/icons";
import Link from "next/link";

const { Title, Text } = Typography;
const { Content } = Layout;
const { confirm } = Modal;
const { Search } = Input;

// Hàm sửa lỗi encoding tiếng Việt
const fixVietnameseEncoding = (text) => {
  if (!text) return "";
  
  // Các cặp ký tự bị lỗi encoding và giá trị đúng
  const replacements = {
    "Ã": "Á", "Ã": "Á", "Ã€": "À", "Ã": "Ả", "Ã": "Ã", "Ã": "Ạ",
    "ã": "á", "ã": "à", "ã": "ả", "ã": "ã", "ã": "ạ",
    "Ä": "Â", "Ä‚": "Ă",
    "Ãª": "ê", "Æ°": "ư", "Æ¡": "ơ",
    "Ã´": "ô", "Ã¹": "ù", "Ã¬": "ì",
    "á»": "ố", "á»": "ồ", "á»": "ổ", "á»": "ỗ", "á»": "ộ",
    "á»": "ớ", "á»": "ờ", "á»": "ở", "á»": "ỡ", "á»": "ợ",
    "á»": "ứ", "á»": "ừ", "á»": "ử", "á»": "ữ", "á»": "ự",
    "á»": "ế", "á»": "ề", "á»": "ể", "á»": "ễ", "á»": "ệ",
    "Ã½": "ý", "á»³": "ỳ", "á»·": "ỷ", "á»¹": "ỵ",
    "Ä'": "đ", "Ä": "Đ",
    "ThÃ¡": "Thá", "ThÃ": "Thà", "ThÃ£": "Thã", "ThÃ¢": "Thâ",
    "TrÆ°á»": "Trườ", "TrÆ°á»": "Trưở", "TrÆ°á»": "Trưỡ",
    "KhÃ³": "Khó", "KhÃ´": "Không", "ToÃ¡": "Toá", "ToÃ¡n": "Toán",
    "Tiáº¿": "Tiế", "Tiáº¿ng": "Tiếng",
    "TOÃN": "TOÁN", "VÄ‚N": "VĂN", "Äá»": "ĐỖ", "Äá»¨C": "ĐỨC"
  };
  
  // Thay thế các ký tự lỗi
  let result = text;
  for (const [wrongChar, correctChar] of Object.entries(replacements)) {
    result = result.replace(new RegExp(wrongChar, 'g'), correctChar);
  }
  
  return result;
};

// Thêm danh sách môn học giống với EditCourseInfoModal.js
const SUBJECTS = [
  { value: "math", label: "Toán học" },
  { value: "physics", label: "Vật lý" },
  { value: "chemistry", label: "Hóa học" },
  { value: "biology", label: "Sinh học" },
  { value: "literature", label: "Ngữ văn" },
  { value: "english", label: "Tiếng Anh" },
  { value: "english_cert", label: "Luyện thi chứng chỉ tiếng Anh (IELTS, TOEFL, TOEIC)" },
  { value: "japanese", label: "Tiếng Nhật" },
  { value: "korean", label: "Tiếng Hàn" },
  { value: "chinese", label: "Tiếng Trung" },
  { value: "history", label: "Lịch sử" },
  { value: "geography", label: "Địa lý" },
  { value: "informatics", label: "Tin học" },
  { value: "assessment", label: "Ôn thi đánh giá năng lực" },
  { value: "eleo", label: "Thi ELEO" },
  { value: "other", label: "Khác" },
];

// Thêm danh sách lớp giống với EditCourseInfoModal.js
const GRADES = [
  { value: "grade6", label: "Lớp 6" },
  { value: "grade7", label: "Lớp 7" },
  { value: "grade8", label: "Lớp 8" },
  { value: "grade9", label: "Lớp 9" },
  { value: "grade10", label: "Lớp 10" },
  { value: "grade11", label: "Lớp 11" },
  { value: "grade12", label: "Lớp 12" },
  { value: "other", label: "Khác" },
];

export default function CoursesPage() {
  const [courses, setCourses] = useState([]);
  const [filteredCourses, setFilteredCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editField, setEditField] = useState(null);
  const [form] = Form.useForm();

  // Thêm state cho chức năng sửa hàng loạt
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [bulkEditModalVisible, setBulkEditModalVisible] = useState(false);
  const [bulkEditForm] = Form.useForm();

  // Thêm state cho modal thêm khóa học nhanh
  const [quickAddModalVisible, setQuickAddModalVisible] = useState(false);
  const [quickAddForm] = Form.useForm();

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

  // Thêm state cho bộ lọc và sắp xếp
  const [filters, setFilters] = useState({
    subject: [],
    grade: [],
    priceRange: null,
    teacher: [],
  });
  const [sortConfig, setSortConfig] = useState({
    field: 'updatedAt',
    direction: 'descend',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [filterForm] = Form.useForm();
  
  // Thêm state để biết khi nào dữ liệu đã tải xong và sẵn sàng để lọc
  const [dataLoaded, setDataLoaded] = useState(false);

  // Tải dữ liệu khóa học
  useEffect(() => {
    fetchCourses();
  }, []);

  // Effect riêng để áp dụng bộ lọc sau khi dữ liệu đã tải xong
  useEffect(() => {
    if (dataLoaded) {
      console.log("Áp dụng bộ lọc sau khi dữ liệu đã tải:", filters);
      console.log("Dữ liệu gốc courses:", courses.length);
      applyFiltersAndSort();
    }
  }, [dataLoaded, courses, filters, sortConfig, searchText]);

  const fetchCourses = async () => {
    try {
      setLoading(true);
      setDataLoaded(false);
      
      const response = await fetch("/api/courses");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Không thể tải danh sách khóa học");
      }

      // Kiểm tra dữ liệu nhận được
      console.log("Dữ liệu khóa học từ API:", data.data?.length || 0, "khóa học");

      // Đảm bảo tất cả các trường đều có giá trị mặc định và xử lý lỗi encoding
      const formattedCourses = data.data.map((course) => {
        // Kiểm tra và chuẩn hóa các trường dữ liệu
        const formattedCourse = {
          ...course,
          title: fixVietnameseEncoding(course.title) || "Khóa học không tên",
          price: typeof course.price === 'number' ? course.price : 0,
          discountPrice: typeof course.discountPrice === 'number' ? course.discountPrice : 0,
          teacher: fixVietnameseEncoding(course.teacher) || "",
          // Nhận dạng môn học từ tiêu đề nếu subject là "other"
          subject: detectSubjectFromTitle(course.title, course.subject),
          grade: detectGradeFromTitle(course.title, course.grade),
          chaptersCount: typeof course.chaptersCount === 'number' ? course.chaptersCount : 0,
          lessonsCount: typeof course.lessonsCount === 'number' ? course.lessonsCount : 0,
          status: course.status || "draft",
          updatedAt: course.updatedAt || new Date().toISOString(),
        };
        
        // Xác nhận rằng các trường quan trọng đều có kiểu dữ liệu đúng
        formattedCourse.price = Number(formattedCourse.price);
        formattedCourse.discountPrice = Number(formattedCourse.discountPrice);
        
        return formattedCourse;
      });

      console.log("Dữ liệu sau khi format:", formattedCourses.length, "khóa học");
      
      // Kiểm tra giá trị thực tế của các trường subject và grade
      const subjectValues = {};
      const gradeValues = {};
      
      formattedCourses.forEach(course => {
        if (course.subject) {
          subjectValues[course.subject] = (subjectValues[course.subject] || 0) + 1;
        }
        if (course.grade) {
          gradeValues[course.grade] = (gradeValues[course.grade] || 0) + 1;
        }
      });
      
      console.log("Giá trị subject trong dữ liệu:", subjectValues);
      console.log("Giá trị grade trong dữ liệu:", gradeValues);
      
      setCourses(formattedCourses);
      setFilteredCourses(formattedCourses);
      
      // Đánh dấu dữ liệu đã tải xong
      setDataLoaded(true);
    } catch (error) {
      console.error("Error fetching courses:", error);
      message.error("Không thể tải danh sách khóa học: " + (error.message || ""));
      setDataLoaded(true); // Vẫn đánh dấu đã tải xong để có thể hiển thị UI
    } finally {
      setLoading(false);
    }
  };

  // Hàm nhận dạng môn học từ tiêu đề khóa học
  const detectSubjectFromTitle = (title, existingSubject) => {
    if (!title) return existingSubject || "other";
    
    const normalizedTitle = title.toLowerCase();
    
    // Các từ khóa để nhận dạng môn học
    const keywords = {
      "toán": "math",
      "toan": "math",
      "toá": "math",
      "vật lý": "physics",
      "vat ly": "physics",
      "lí": "physics",
      "ly": "physics",
      "hóa": "chemistry", 
      "hoa": "chemistry",
      "sinh": "biology",
      "sinh học": "biology",
      "văn": "literature",
      "van": "literature",
      "ngữ văn": "literature",
      "tiếng anh": "english",
      "tieng anh": "english",
      "anh": "english",
      "english": "english",
      "ielts": "english_cert",
      "toefl": "english_cert",
      "toeic": "english_cert",
      "tiếng nhật": "japanese",
      "nhật": "japanese",
      "nhat": "japanese",
      "tiếng trung": "chinese",
      "trung": "chinese",
      "tiếng hàn": "korean",
      "hàn": "korean",
      "han": "korean",
      "lịch sử": "history",
      "lich su": "history",
      "sử": "history",
      "su": "history",
      "địa": "geography",
      "dia": "geography",
      "địa lý": "geography",
      "tin": "informatics",
      "tin học": "informatics",
      "đánh giá năng lực": "assessment",
      "danh gia nang luc": "assessment",
      "đgnl": "assessment",
      "năng lực": "assessment",
      "nang luc": "assessment",
      "tư duy": "assessment",
      "tu duy": "assessment",
      "tsa": "assessment",
      "eleo": "eleo"
    };
    
    // Kiểm tra từng từ khóa
    for (const [keyword, subject] of Object.entries(keywords)) {
      if (normalizedTitle.includes(keyword)) {
        return subject;
      }
    }
    
    // Trả về giá trị mặc định nếu không phát hiện
    return existingSubject || "other";
  };

  // Hàm nhận dạng lớp từ tiêu đề khóa học
  const detectGradeFromTitle = (title, existingGrade) => {
    if (!title) return existingGrade || "other";
    
    const normalizedTitle = title.toLowerCase();
    
    // Các từ khóa để nhận dạng lớp
    const gradeKeywords = {
      "lớp 6": "grade6",
      "lop 6": "grade6",
      "2k11": "grade6",
      "2011": "grade6",
      "lớp 7": "grade7",
      "lop 7": "grade7",
      "2k10": "grade7",
      "2010": "grade7",
      "lớp 8": "grade8",
      "lop 8": "grade8",
      "2k9": "grade8",
      "2009": "grade8",
      "lớp 9": "grade9",
      "lop 9": "grade9",
      "2k8": "grade9",
      "2008": "grade9",
      "lớp 10": "grade10",
      "lop 10": "grade10",
      "2k7": "grade10",
      "2007": "grade10",
      "lớp 11": "grade11",
      "lop 11": "grade11",
      "2k6": "grade11",
      "2006": "grade11",
      "lớp 12": "grade12",
      "lop 12": "grade12",
      "2k5": "grade12",
      "2005": "grade12",
      "đại học": "other",
      "dai hoc": "other"
    };
    
    // Kiểm tra từng từ khóa
    for (const [keyword, grade] of Object.entries(gradeKeywords)) {
      if (normalizedTitle.includes(keyword)) {
        return grade;
      }
    }
    
    // Trả về giá trị mặc định nếu không phát hiện
    return existingGrade || "other";
  };

  // Hàm định dạng giá
  const formatPrice = (price) => {
    if (!price && price !== 0) return "0";
    return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };
  
  const applyFiltersAndSort = () => {
    // Ghi log cho debugging
    console.log("Bắt đầu applyFiltersAndSort");
    console.log("- Số khóa học gốc:", courses.length);
    console.log("- Filters hiện tại:", JSON.stringify(filters));
    console.log("- Tìm kiếm:", searchText);
    
    let result = [...courses];
    let filterApplied = false;
    
    // Áp dụng tìm kiếm nếu có
    if (searchText && searchText.trim() !== "") {
      filterApplied = true;
      const lowercasedQuery = searchText.toLowerCase().trim();
      result = result.filter(
        (course) =>
          (course.title && course.title.toLowerCase().includes(lowercasedQuery)) ||
          (course.description && course.description.toLowerCase().includes(lowercasedQuery)) ||
          (course.teacher && course.teacher.toLowerCase().includes(lowercasedQuery)) ||
          (course.price && course.price.toString().includes(lowercasedQuery))
      );
      console.log("- Sau khi lọc theo tìm kiếm:", result.length);
    }
    
    // Áp dụng lọc theo môn học
    if (filters.subject && filters.subject.length > 0) {
      filterApplied = true;
      const before = result.length;
      
      // Debug: hiển thị chi tiết các giá trị subject trong dữ liệu
      console.log("- Debug subject values trước khi lọc:");
      const subjectCounts = {};
      result.forEach(course => {
        if (!subjectCounts[course.subject || "undefined"]) {
          subjectCounts[course.subject || "undefined"] = 0;
        }
        subjectCounts[course.subject || "undefined"]++;
      });
      console.log(subjectCounts);
      
      result = result.filter(course => {
        const hasMatchingSubject = course.subject && filters.subject.includes(course.subject);
        if (!hasMatchingSubject && course.subject) {
          console.log(`- Course không khớp: title=${course.title}, subject=${course.subject}, filter=${filters.subject}`);
        }
        return hasMatchingSubject;
      });
      console.log(`- Sau khi lọc theo môn học (${filters.subject.join(',')}):`, result.length, `(trước: ${before})`);
    }
    
    // Áp dụng lọc theo lớp
    if (filters.grade && filters.grade.length > 0) {
      filterApplied = true;
      const before = result.length;
      
      // Debug: hiển thị chi tiết các giá trị grade trong dữ liệu
      console.log("- Debug grade values trước khi lọc:");
      const gradeCounts = {};
      result.forEach(course => {
        if (!gradeCounts[course.grade || "undefined"]) {
          gradeCounts[course.grade || "undefined"] = 0;
        }
        gradeCounts[course.grade || "undefined"]++;
      });
      console.log(gradeCounts);
      
      result = result.filter(course => {
        const hasMatchingGrade = course.grade && filters.grade.includes(course.grade);
        return hasMatchingGrade;
      });
      console.log(`- Sau khi lọc theo lớp (${filters.grade.join(',')}):`, result.length, `(trước: ${before})`);
    }
    
    // Áp dụng lọc theo giáo viên
    if (filters.teacher && filters.teacher.length > 0) {
      filterApplied = true;
      const before = result.length;
      result = result.filter(course => {
        const hasMatchingTeacher = course.teacher && filters.teacher.includes(course.teacher);
        return hasMatchingTeacher;
      });
      console.log(`- Sau khi lọc theo giáo viên (${filters.teacher.join(',')}):`, result.length, `(trước: ${before})`);
    }
    
    // Áp dụng lọc theo khoảng giá
    if (filters.priceRange) {
      const [min, max] = filters.priceRange;
      if (min !== null && min !== undefined) {
        filterApplied = true;
        const before = result.length;
        result = result.filter(course => course.price && Number(course.price) >= min);
        console.log(`- Sau khi lọc giá tối thiểu (${min}):`, result.length, `(trước: ${before})`);
      }
      if (max !== null && max !== undefined) {
        filterApplied = true;
        const before = result.length;
        result = result.filter(course => course.price && Number(course.price) <= max);
        console.log(`- Sau khi lọc giá tối đa (${max}):`, result.length, `(trước: ${before})`);
      }
    }
    
    // Áp dụng sắp xếp
    if (sortConfig.field) {
      result.sort((a, b) => {
        // Xử lý trường hợp giá trị null hoặc undefined
        if (a[sortConfig.field] === null || a[sortConfig.field] === undefined) return 1;
        if (b[sortConfig.field] === null || b[sortConfig.field] === undefined) return -1;
        
        let comparison = 0;
        if (sortConfig.field === 'price' || sortConfig.field === 'discountPrice') {
          // Đảm bảo so sánh số
          const aValue = Number(a[sortConfig.field]) || 0;
          const bValue = Number(b[sortConfig.field]) || 0;
          comparison = aValue - bValue;
        } else if (sortConfig.field === 'updatedAt') {
          // Xử lý so sánh ngày
          try {
            const aDate = new Date(a.updatedAt || 0);
            const bDate = new Date(b.updatedAt || 0);
            comparison = aDate - bDate;
          } catch (error) {
            console.error("Lỗi khi so sánh ngày:", error);
            comparison = 0;
          }
        } else {
          // So sánh chuỗi an toàn
          const aValue = String(a[sortConfig.field] || '');
          const bValue = String(b[sortConfig.field] || '');
          comparison = aValue.localeCompare(bValue);
        }
        
        return sortConfig.direction === 'ascend' ? comparison : -comparison;
      });
      console.log(`- Sau khi sắp xếp theo ${sortConfig.field}:`, result.length);
    }
    
    console.log("- Kết quả cuối cùng:", result.length, "khóa học");
    console.log("- Đã có lọc:", filterApplied);
    
    setFilteredCourses(result);
  };

  const handleSearch = (value) => {
    console.log("Thiết lập tìm kiếm:", value);
    setSearchText(value);
  };
  
  // Hàm xử lý áp dụng bộ lọc từ modal
  const applyFilters = (values) => {
    console.log("Áp dụng bộ lọc từ modal:", values);
    const newFilters = {
      subject: values.subject || [],
      grade: values.grade || [],
      priceRange: values.priceRange,
      teacher: values.teacher || [],
    };
    
    setFilters(newFilters);
    setShowFilters(false);
  };
  
  // Hàm xử lý đặt lại bộ lọc từ panel bộ lọc
  const resetFilters = () => {
    // Reset form
    filterForm.resetFields();
    
    // Reset state bộ lọc
    const newFilters = {
      subject: [],
      grade: [],
      priceRange: null,
      teacher: [],
    };
    
    setFilters(newFilters);
    console.log("Đặt lại tất cả bộ lọc:", newFilters);
    setShowFilters(false);
  };
  
  // Reset tất cả bộ lọc và quay về trạng thái ban đầu
  const resetAllFilters = () => {
    console.log("Reset toàn bộ bộ lọc");
    
    setFilters({
      subject: [],
      grade: [],
      priceRange: null,
      teacher: [],
    });
    setSearchText("");
    setSortConfig({
      field: 'updatedAt',
      direction: 'descend',
    });
    if(filterForm) {
      filterForm.resetFields();
    }
    
    // Đặt trực tiếp filteredCourses về courses
    setFilteredCourses([...courses]);
  };
  
  // Hàm xử lý thay đổi sắp xếp
  const handleSortChange = (item) => {
    const [field, direction] = item.key.split('-');
    console.log(`Thiết lập sắp xếp theo ${field}, hướng ${direction}`);
    setSortConfig({
      field,
      direction,
    });
  };
  
  // Xử lý chọn môn học
  const handleSubjectChange = (subject, checked) => {
    console.log(`Chọn môn học ${subject}: ${checked}`);
    const newFilters = {...filters};
    
    if (checked) {
      newFilters.subject = [subject];
    } else {
      newFilters.subject = newFilters.subject.filter(s => s !== subject);
    }
    
    setFilters(newFilters);
  }
  
  // Xử lý chọn lớp
  const handleGradeChange = (grade, checked) => {
    console.log(`Chọn lớp ${grade}: ${checked}`);
    const newFilters = {...filters};
    
    if (checked) {
      newFilters.grade = [grade];
    } else {
      newFilters.grade = newFilters.grade.filter(g => g !== grade);
    }
    
    setFilters(newFilters);
  }
  
  // Tạo menu sắp xếp
  const sortMenu = (
    <Menu onClick={handleSortChange}>
      <Menu.ItemGroup title="Tên">
        <Menu.Item key="title-ascend">A-Z</Menu.Item>
        <Menu.Item key="title-descend">Z-A</Menu.Item>
      </Menu.ItemGroup>
      <Menu.Divider />
      <Menu.ItemGroup title="Giá">
        <Menu.Item key="price-ascend">Thấp đến cao</Menu.Item>
        <Menu.Item key="price-descend">Cao đến thấp</Menu.Item>
      </Menu.ItemGroup>
      <Menu.Divider />
      <Menu.ItemGroup title="Ngày cập nhật">
        <Menu.Item key="updatedAt-descend">Mới nhất</Menu.Item>
        <Menu.Item key="updatedAt-ascend">Cũ nhất</Menu.Item>
      </Menu.ItemGroup>
    </Menu>
  );
  
  // Tạo danh sách giáo viên duy nhất
  const uniqueTeachers = Array.from(
    new Set(courses.filter(course => course.teacher).map(course => course.teacher))
  )
  .filter(teacher => teacher)
  .map(teacher => ({ value: teacher, label: teacher }));

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

  const startEditing = (record, fieldName) => {
    setEditingId(record.id);
    setEditField(fieldName);
    
    // Dựa vào trường đang sửa, đặt giá trị ban đầu cho form
    if (fieldName === 'price') {
      form.setFieldsValue({ price: record.price || 0 });
    } else if (fieldName === 'teacher') {
      form.setFieldsValue({ teacher: record.teacher || "" });
    } else if (fieldName === 'subject') {
      form.setFieldsValue({ subject: record.subject || "other" });
    } else if (fieldName === 'grade') {
      form.setFieldsValue({ grade: record.grade || "other" });
    }
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditField(null);
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

      // Tạo dữ liệu cập nhật dựa trên trường đang sửa
      const updateData = {
        courseId: record.id,
      };
      
      // Chỉ cập nhật trường đang sửa
      if (editField === 'price') {
        updateData.price = values.price;
      } else if (editField === 'teacher') {
        updateData.teacher = values.teacher || "";
      } else if (editField === 'subject') {
        updateData.subject = values.subject || "other";
      } else if (editField === 'grade') {
        updateData.grade = values.grade || "other";
      }

      console.log("Dữ liệu gửi đi:", updateData);

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
      setEditField(null);
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

  // Hàm mở modal thêm nhanh khóa học mới
  const openQuickAddModal = () => {
    quickAddForm.resetFields();
    setQuickAddModalVisible(true);
  };

  // Hàm lưu thêm nhanh khóa học mới
  const saveQuickAddCourse = async () => {
    try {
      const values = await quickAddForm.validateFields();
      setLoading(true);

      const response = await fetch("/api/courses/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: values.title,
          price: values.price || 0,
          teacher: values.teacher || "",
          subject: values.subject || "other",
          grade: values.grade || "other",
          driveUrl: values.driveUrl || null,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi thêm khóa học");
      }

      message.success("Thêm khóa học thành công");
      setQuickAddModalVisible(false);
      quickAddForm.resetFields();
      await fetchCourses();
    } catch (error) {
      console.error("Lỗi khi thêm khóa học:", error);
      message.error(
        error.message || "Không thể thêm khóa học. Vui lòng thử lại sau."
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

  // Hàm đồng bộ khóa học
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

  // Hàm đồng bộ các khóa học đã chọn
  const syncSelectedCourses = async () => {
    try {
      // Lọc danh sách khóa học được chọn có Drive URL
      const selectedCourses = courses.filter(
        (course) => selectedRowKeys.includes(course.id) && course.driveUrl
      );

      if (selectedCourses.length === 0) {
        message.warning("Không có khóa học nào được chọn có Drive URL để đồng bộ");
        return;
      }

      // Hiển thị thông báo nếu một số khóa học không có Drive URL
      if (selectedCourses.length < selectedRowKeys.length) {
        const missingUrlCount = selectedRowKeys.length - selectedCourses.length;
        message.warning(`${missingUrlCount} khóa học được chọn không có Drive URL và sẽ bị bỏ qua`);
      }

      // Hiển thị hộp thoại xác nhận
      confirm({
        title: "Xác nhận đồng bộ khóa học đã chọn",
        content: `Bạn sắp đồng bộ ${selectedCourses.length} khóa học đã chọn từ Google Drive. Quá trình này có thể tốn thời gian. Bạn có chắc chắn muốn tiếp tục?`,
        okText: "Đồng bộ ngay",
        cancelText: "Hủy",
        onOk: async () => {
          try {
            // Cập nhật trạng thái
            setBatchSyncLoading(true);
            setBatchSyncProgress({
              current: 0,
              total: selectedCourses.length,
              currentCourse: null,
              results: [],
            });

            // Tạo và hiển thị modal thông tin
            const syncModalInstance = Modal.info({
              title: "Đang đồng bộ khóa học đã chọn",
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
            for (let i = 0; i < selectedCourses.length; i++) {
              const course = selectedCourses[i];

              // Cập nhật tiến trình
              const currentProgress = {
                current: i + 1,
                total: selectedCourses.length,
                currentCourse: course,
                results: batchSyncProgress.results,
              };

              setBatchSyncProgress(currentProgress);

              // Cập nhật modal với tiến trình hiện tại
              const progressPercent = Math.round(
                (currentProgress.current / currentProgress.total) * 100
              );

              syncModalInstance.update({
                title: "Đang đồng bộ khóa học đã chọn",
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
                if (i < selectedCourses.length - 1) {
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
              title: "Hoàn thành đồng bộ khóa học đã chọn",
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
              `Đã hoàn thành đồng bộ ${selectedCourses.length} khóa học đã chọn`
            );

            // Tải lại danh sách khóa học
            await fetchCourses();
            // Bỏ chọn các khóa học
            setSelectedRowKeys([]);
          } catch (error) {
            console.error("Lỗi khi đồng bộ khóa học đã chọn:", error);
            message.error(`Quá trình đồng bộ gặp lỗi: ${error.message}`);
          } finally {
            setBatchSyncLoading(false);
          }
        },
      });
    } catch (error) {
      console.error("Lỗi khi chuẩn bị đồng bộ khóa học đã chọn:", error);
      message.error(`Lỗi: ${error.message}`);
    }
  };

  // Xử lý chọn hàng
  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys) => {
      setSelectedRowKeys(selectedKeys);
    },
  };

  // Mở modal sửa hàng loạt
  const openBulkEditModal = () => {
    bulkEditForm.resetFields();
    setBulkEditModalVisible(true);
  };

  // Lưu thông tin sửa hàng loạt
  const saveBulkEdit = async () => {
    try {
      if (selectedRowKeys.length === 0) {
        message.warning("Vui lòng chọn ít nhất một khóa học");
        return;
      }

      const values = await bulkEditForm.validateFields();
      setLoading(true);

      const updateData = {
        courseIds: selectedRowKeys,
      };

      // Chỉ cập nhật những trường có dữ liệu
      if (values.price !== undefined && values.price !== null) {
        updateData.price = values.price;
      }

      if (values.teacher !== undefined && values.teacher !== '') {
        updateData.teacher = values.teacher;
      }
      
      if (values.subject !== undefined && values.subject !== '') {
        updateData.subject = values.subject;
      }
      
      if (values.grade !== undefined && values.grade !== '') {
        updateData.grade = values.grade;
      }

      if (!updateData.price && !updateData.teacher && !updateData.subject && !updateData.grade) {
        message.warning("Vui lòng nhập ít nhất một thông tin để cập nhật");
        setLoading(false);
        return;
      }

      const response = await fetch("/api/courses/bulk-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Có lỗi xảy ra khi cập nhật hàng loạt");
      }

      message.success(`Đã cập nhật ${selectedRowKeys.length} khóa học thành công`);
      setBulkEditModalVisible(false);
      bulkEditForm.resetFields();
      setSelectedRowKeys([]);
      await fetchCourses();
    } catch (error) {
      console.error("Lỗi khi cập nhật hàng loạt:", error);
      message.error(
        error.message || "Không thể cập nhật hàng loạt. Vui lòng thử lại sau."
      );
    } finally {
      setLoading(false);
    }
  };

  // Hàm format tên môn học
  const formatSubject = (value) => {
    if (!value) return "Chưa có thông tin";
    
    const subject = SUBJECTS.find(item => item.value === value);
    return subject ? subject.label : value;
  };

  // Hàm format tên lớp
  const formatGrade = (value) => {
    const grade = GRADES.find(item => item.value === value);
    return grade ? grade.label : value || "Chưa có thông tin";
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
        const isEditing = record.id === editingId && editField === 'price';
        return isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Form.Item
              name="price"
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập giá!",
                },
              ]}
              style={{ margin: 0, flex: 1 }}
            >
              <InputNumber
                min={0}
                formatter={(value) => formatPrice(value)}
                parser={(value) => value.replace(/\$\s?|(,*)/g, "")}
                style={{ width: "100%" }}
                autoFocus
              />
            </Form.Item>
            <Space style={{ marginLeft: 8 }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                size="small"
                onClick={() => saveEdit(record)}
              />
              <Button
                icon={<CloseOutlined />}
                size="small"
                onClick={cancelEditing}
              />
            </Space>
          </div>
        ) : (
          <div 
            style={{ cursor: 'pointer' }} 
            onClick={() => startEditing(record, 'price')}
          >
            <Text>{formatPrice(text)} VNĐ</Text>
            <EditOutlined style={{ marginLeft: 8, color: '#1890ff' }} />
          </div>
        );
      },
    },
    {
      title: "Giáo viên",
      dataIndex: "teacher",
      key: "teacher",
      width: "15%",
      render: (text, record) => {
        const isEditing = record.id === editingId && editField === 'teacher';
        return isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Form.Item
              name="teacher"
              rules={[
                {
                  required: true,
                  message: "Vui lòng nhập tên giáo viên!",
                },
              ]}
              style={{ margin: 0, flex: 1 }}
            >
              <Input autoFocus />
            </Form.Item>
            <Space style={{ marginLeft: 8 }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                size="small"
                onClick={() => saveEdit(record)}
              />
              <Button
                icon={<CloseOutlined />}
                size="small"
                onClick={cancelEditing}
              />
            </Space>
          </div>
        ) : (
          <div 
            style={{ cursor: 'pointer' }} 
            onClick={() => startEditing(record, 'teacher')}
          >
            <Text>{text || "Chưa có thông tin"}</Text>
            <EditOutlined style={{ marginLeft: 8, color: '#1890ff' }} />
          </div>
        );
      },
    },
    {
      title: "Môn học",
      dataIndex: "subject",
      key: "subject",
      width: "15%",
      render: (text, record) => {
        const isEditing = record.id === editingId && editField === 'subject';
        return isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Form.Item
              name="subject"
              rules={[
                {
                  required: true,
                  message: "Vui lòng chọn môn học!",
                },
              ]}
              style={{ margin: 0, flex: 1 }}
            >
              <Select 
                options={SUBJECTS}
                autoFocus 
                placeholder="Chọn môn học"
              />
            </Form.Item>
            <Space style={{ marginLeft: 8 }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                size="small"
                onClick={() => saveEdit(record)}
              />
              <Button
                icon={<CloseOutlined />}
                size="small"
                onClick={cancelEditing}
              />
            </Space>
          </div>
        ) : (
          <div 
            style={{ cursor: 'pointer' }} 
            onClick={() => startEditing(record, 'subject')}
          >
            <Text>{formatSubject(text)}</Text>
            <EditOutlined style={{ marginLeft: 8, color: '#1890ff' }} />
          </div>
        );
      },
    },
    {
      title: "Lớp",
      dataIndex: "grade",
      key: "grade",
      width: "15%",
      render: (text, record) => {
        const isEditing = record.id === editingId && editField === 'grade';
        return isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Form.Item
              name="grade"
              rules={[
                {
                  required: true,
                  message: "Vui lòng chọn lớp!",
                },
              ]}
              style={{ margin: 0, flex: 1 }}
            >
              <Select 
                options={GRADES}
                autoFocus 
                placeholder="Chọn lớp"
              />
            </Form.Item>
            <Space style={{ marginLeft: 8 }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                size="small"
                onClick={() => saveEdit(record)}
              />
              <Button
                icon={<CloseOutlined />}
                size="small"
                onClick={cancelEditing}
              />
            </Space>
          </div>
        ) : (
          <div 
            style={{ cursor: 'pointer' }} 
            onClick={() => startEditing(record, 'grade')}
          >
            <Text>{formatGrade(text)}</Text>
            <EditOutlined style={{ marginLeft: 8, color: '#1890ff' }} />
          </div>
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
        return (
          <Space size="small">
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
              Quản lý khóa học ({filteredCourses.length}/{courses.length})
            </Title>
          </Col>
          <Col xs={24} md={12} className="flex justify-end items-center gap-2">
            <Search
              placeholder="Tìm kiếm theo tên, giá, giáo viên..."
              allowClear
              enterButton={<SearchOutlined />}
              size="large"
              onSearch={handleSearch}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ maxWidth: 400 }}
              value={searchText}
            />
            <Button
              type="default"
              icon={<FilterOutlined />}
              size="large"
              onClick={() => setShowFilters(true)}
            >
              Lọc
            </Button>
            <Dropdown overlay={sortMenu} trigger={['click']}>
              <Button type="default" size="large">
                <Space>
                  <SortAscendingOutlined />
                  Sắp xếp
                  <DownOutlined />
                </Space>
              </Button>
            </Dropdown>
            {(filters.subject.length > 0 || filters.grade.length > 0 || 
              filters.teacher.length > 0 || filters.priceRange || searchText) && (
              <Button
                type="primary"
                icon={<CloseOutlined />}
                size="large"
                onClick={resetAllFilters}
              >
                Xóa lọc
              </Button>
            )}
            {selectedRowKeys.length > 0 && (
              <Button
                type="primary"
                icon={<GroupOutlined />}
                size="large"
                onClick={openBulkEditModal}
              >
                Sửa {selectedRowKeys.length} khóa học
              </Button>
            )}
            {selectedRowKeys.length > 0 && (
              <Button
                type="primary"
                icon={<CloudSyncOutlined />}
                size="large"
                onClick={syncSelectedCourses}
                loading={batchSyncLoading}
                disabled={batchSyncLoading}
              >
                Đồng bộ đã chọn
              </Button>
            )}
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="large"
              onClick={openQuickAddModal}
            >
              Thêm nhanh
            </Button>
            <Link href="/add-course">
              <Button type="default" icon={<PlusOutlined />} size="large">
                Thêm chi tiết
              </Button>
            </Link>
          </Col>
        </Row>

        {/* Hiển thị các bộ lọc đang áp dụng */}
        {(filters.subject.length > 0 || filters.grade.length > 0 || filters.teacher.length > 0 || filters.priceRange) && (
          <div className="mb-4">
            <Space size={[0, 8]} wrap>
              <span>Bộ lọc đang áp dụng:</span>
              {filters.subject.map((subject) => (
                <Tag key={subject} closable onClose={() => setFilters({...filters, subject: filters.subject.filter(s => s !== subject)})}>
                  Môn học: {formatSubject(subject)}
                </Tag>
              ))}
              {filters.grade.map((grade) => (
                <Tag key={grade} closable onClose={() => setFilters({...filters, grade: filters.grade.filter(g => g !== grade)})}>
                  Lớp: {formatGrade(grade)}
                </Tag>
              ))}
              {filters.teacher.map((teacher) => (
                <Tag key={teacher} closable onClose={() => setFilters({...filters, teacher: filters.teacher.filter(t => t !== teacher)})}>
                  Giáo viên: {teacher}
                </Tag>
              ))}
              {filters.priceRange && (
                <Tag closable onClose={() => setFilters({...filters, priceRange: null})}>
                  Giá: {filters.priceRange[0] ? formatPrice(filters.priceRange[0]) : '0'} - {filters.priceRange[1] ? formatPrice(filters.priceRange[1]) : 'Không giới hạn'} VNĐ
                </Tag>
              )}
              <Button size="small" type="link" onClick={resetAllFilters}>
                Xóa tất cả bộ lọc
              </Button>
            </Space>
          </div>
        )}

        {/* Thêm thanh lọc nhanh theo môn học */}
        <div className="mb-4">
          <div className="mb-2 font-medium">Lọc nhanh theo môn học:</div>
          <Space size={[8, 8]} wrap>
            <Tag.CheckableTag
              checked={!filters.subject.length}
              onChange={() => {
                const newFilters = {...filters, subject: []};
                setFilters(newFilters);
                console.log("Đặt lại bộ lọc môn học:", newFilters);
              }}
              style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}
            >
              Tất cả môn
            </Tag.CheckableTag>
            {/* Hiển thị các bộ lọc dựa trên giá trị thực tế */}
            {Object.keys(
              courses.reduce((acc, course) => {
                if (course.subject) acc[course.subject] = true;
                return acc;
              }, {})
            ).map(subject => (
              <Tag.CheckableTag
                key={subject}
                checked={filters.subject.includes(subject)}
                onChange={checked => handleSubjectChange(subject, checked)}
                style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}
              >
                {formatSubject(subject)}
              </Tag.CheckableTag>
            ))}
            <Button 
              type="text" 
              size="small" 
              icon={<FilterOutlined />}
              onClick={() => setShowFilters(true)}
            >
              Bộ lọc khác
            </Button>
          </Space>
        </div>

        {/* Lọc nhanh theo lớp */}
        <div className="mb-4">
          <div className="mb-2 font-medium">Lọc theo lớp:</div>
          <Space size={[8, 8]} wrap>
            <Tag.CheckableTag
              checked={!filters.grade.length}
              onChange={() => {
                const newFilters = {...filters, grade: []};
                setFilters(newFilters);
                console.log("Đặt lại bộ lọc lớp:", newFilters);
              }}
              style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}
            >
              Tất cả lớp
            </Tag.CheckableTag>
            {GRADES.map(grade => (
              <Tag.CheckableTag
                key={grade.value}
                checked={filters.grade.includes(grade.value)}
                onChange={checked => handleGradeChange(grade.value, checked)}
                style={{ border: '1px solid #d9d9d9', padding: '4px 8px' }}
              >
                {grade.label}
              </Tag.CheckableTag>
            ))}
          </Space>
        </div>

        <Form form={form} component={false}>
          <Table
            rowSelection={rowSelection}
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

      {/* Modal bộ lọc */}
      <Modal
        title="Lọc khóa học"
        open={showFilters}
        onOk={() => filterForm.submit()}
        onCancel={() => setShowFilters(false)}
        okText="Áp dụng"
        cancelText="Hủy"
        width={700}
      >
        <Form 
          form={filterForm} 
          layout="vertical" 
          initialValues={filters}
          onFinish={applyFilters}
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item name="subject" label="Môn học">
                <Select
                  mode="multiple"
                  placeholder="Chọn môn học"
                  options={SUBJECTS}
                  allowClear
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
            
            <Col xs={24} md={12}>
              <Form.Item name="grade" label="Lớp">
                <Select
                  mode="multiple"
                  placeholder="Chọn lớp"
                  options={GRADES}
                  allowClear
                  maxTagCount="responsive"
                />
              </Form.Item>
            </Col>
            
            <Col xs={24} md={12}>
              <Form.Item name="teacher" label="Giáo viên">
                <Select
                  mode="multiple"
                  placeholder="Chọn giáo viên"
                  options={uniqueTeachers}
                  allowClear
                  maxTagCount="responsive"
                  showSearch
                  filterOption={(input, option) => 
                    option.label.toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            
            <Col xs={24} md={12}>
              <Form.Item name="priceRange" label="Khoảng giá">
                <Input.Group compact>
                  <Form.Item
                    noStyle
                    name={['priceRange', 0]}
                  >
                    <InputNumber
                      style={{ width: '45%' }}
                      placeholder="Giá tối thiểu"
                      formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                    />
                  </Form.Item>
                  <span style={{ width: '10%', textAlign: 'center', lineHeight: '32px' }}>-</span>
                  <Form.Item
                    noStyle
                    name={['priceRange', 1]}
                  >
                    <InputNumber
                      style={{ width: '45%' }}
                      placeholder="Giá tối đa"
                      formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                      parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                    />
                  </Form.Item>
                </Input.Group>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

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

      {/* Modal thêm nhanh khóa học */}
      <Modal
        title="Thêm nhanh khóa học mới"
        open={quickAddModalVisible}
        onOk={saveQuickAddCourse}
        onCancel={() => setQuickAddModalVisible(false)}
        okText="Thêm"
        cancelText="Hủy"
      >
        <Form form={quickAddForm} layout="vertical">
          <Form.Item
            name="title"
            label="Tên khóa học"
            rules={[
              {
                required: true,
                message: "Vui lòng nhập tên khóa học!",
              },
            ]}
          >
            <Input placeholder="Nhập tên khóa học" />
          </Form.Item>
          <Form.Item
            name="price"
            label="Giá (VNĐ)"
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
              placeholder="Nhập giá khóa học"
            />
          </Form.Item>
          <Form.Item
            name="teacher"
            label="Giáo viên"
          >
            <Input placeholder="Nhập tên giáo viên" />
          </Form.Item>
          <Form.Item
            name="subject"
            label="Môn học"
            initialValue="math"
          >
            <Select 
              options={SUBJECTS}
              placeholder="Chọn môn học"
            />
          </Form.Item>
          <Form.Item
            name="grade"
            label="Lớp"
            initialValue="grade10"
          >
            <Select 
              options={GRADES}
              placeholder="Chọn lớp"
            />
          </Form.Item>
          <Form.Item
            name="driveUrl"
            label="URL thư mục Google Drive (tùy chọn)"
            rules={[
              {
                type: "url",
                message: "Vui lòng nhập URL hợp lệ!",
              },
            ]}
          >
            <Input placeholder="https://drive.google.com/drive/folders/..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal sửa hàng loạt */}
      <Modal
        title={`Sửa hàng loạt (${selectedRowKeys.length} khóa học)`}
        open={bulkEditModalVisible}
        onOk={saveBulkEdit}
        onCancel={() => setBulkEditModalVisible(false)}
        okText="Cập nhật"
        cancelText="Hủy"
      >
        <Form form={bulkEditForm} layout="vertical">
          <Form.Item
            name="price"
            label="Giá (VNĐ)"
            help="Để trống nếu không muốn cập nhật giá"
          >
            <InputNumber
              style={{ width: '100%' }}
              formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
              placeholder="Nhập giá mới cho tất cả khóa học được chọn"
            />
          </Form.Item>
          <Form.Item
            name="teacher"
            label="Giáo viên"
            help="Để trống nếu không muốn cập nhật giáo viên"
          >
            <Input placeholder="Nhập tên giáo viên mới cho tất cả khóa học được chọn" />
          </Form.Item>
          <Form.Item
            name="subject"
            label="Môn học"
            help="Để trống nếu không muốn cập nhật môn học"
          >
            <Select 
              options={SUBJECTS}
              placeholder="Chọn môn học mới cho tất cả khóa học được chọn"
              allowClear
            />
          </Form.Item>
          <Form.Item
            name="grade"
            label="Lớp"
            help="Để trống nếu không muốn cập nhật lớp"
          >
            <Select 
              options={GRADES}
              placeholder="Chọn lớp mới cho tất cả khóa học được chọn"
              allowClear
            />
          </Form.Item>
        </Form>
        <div style={{ marginTop: 8 }}>
          <Text type="secondary">
            Lưu ý: Thông tin mới sẽ được áp dụng cho tất cả {selectedRowKeys.length} khóa học đã chọn.
            Để trống trường thông tin nếu bạn không muốn cập nhật.
          </Text>
        </div>
      </Modal>
    </Content>
  );
}
