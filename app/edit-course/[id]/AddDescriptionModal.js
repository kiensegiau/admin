"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";

const ReactQuill = dynamic(() => import("react-quill"), {
  ssr: false,
  loading: () => <p>Loading editor...</p>,
});

export default function AddDescriptionModal({ onClose, onAddDescription }) {
  const [description, setDescription] = useState("");
  const quillRef = useRef(null);

  useEffect(() => {
    import("react-quill/dist/quill.snow.css");
    if (quillRef.current) {
      quillRef.current.focus();
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddDescription(description);
  };

  return (
    <div className="fixed z-10 inset-0 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>
        <span
          className="hidden sm:inline-block sm:align-middle sm:h-screen"
          aria-hidden="true"
        >
          &#8203;
        </span>
        <div
          className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-headline"
        >
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3
                    className="text-lg leading-6 font-medium text-gray-900"
                    id="modal-headline"
                  >
                    Thêm mô tả khóa học
                  </h3>
                  <div className="mt-2">
                    <ReactQuill
                      ref={quillRef}
                      value={description}
                      onChange={setDescription}
                      placeholder="Nhập mô tả khóa học..."
                      style={{ height: 400 }}
                    />
                  </div>
                  <div className="mt-4 p-4 bg-gray-100 rounded-md">
                    <h4 className="text-lg font-medium mb-2">
                      Nội dung mô tả:
                    </h4>
                    <div
                      dangerouslySetInnerHTML={{ __html: description }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Thêm
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
