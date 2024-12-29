import { useState } from "react";
import { Modal, Input } from "antd";

const { TextArea } = Input;

const AddDescriptionModal = ({ onClose, onAddDescription }) => {
  const [description, setDescription] = useState("");

  const handleOk = () => {
    onAddDescription(description);
    setDescription("");
  };

  return (
    <Modal
      title="Thêm mô tả khóa học"
      open={true}
      onOk={handleOk}
      onCancel={onClose}
    >
      <TextArea
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Nhập mô tả khóa học"
      />
    </Modal>
  );
};

export default AddDescriptionModal;
