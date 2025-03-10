"use client";

import { Toaster } from "react-hot-toast";

export default function WasabiTestLayout({ children }) {
  return (
    <div>
      <Toaster position="top-right" />
      {children}
    </div>
  );
}
