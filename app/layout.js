import ClientLayout from "./client-layout";

export const metadata = {
  title: "Admin Dashboard",
  description: "Admin Dashboard for managing courses",
};

export default function RootLayout({ children }) {
  return <ClientLayout>{children}</ClientLayout>;
}
