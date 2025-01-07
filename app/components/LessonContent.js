"use client";

import React from "react";
import { List } from "antd";
import { FileOutlined } from "@ant-design/icons";

export default function LessonContent({ lesson }) {
  const renderItem = (file) => (
    <List.Item>
      <List.Item.Meta
        avatar={<FileOutlined />}
        title={file.name}
        description={`${file.type} - ${Math.round(file.size / 1024)} KB`}
      />
    </List.Item>
  );

  return (
    <div className="p-4">
      <List
        dataSource={lesson?.files || []}
        renderItem={renderItem}
      />
    </div>
  );
}
