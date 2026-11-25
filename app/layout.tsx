import type { Metadata } from "next";
import "./globals.css";
import "./dashboard.css";

export const metadata: Metadata = {
  title: "晾一晾 v1.0 · 像素无限工作室",
  authors: [{ name: "像素无限Pixel Infinity" }],
  icons: { icon: "/brand/app-icon.png" },
  description: "把待办挂在便签架上，让朋友陪你完成每一件事。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
