import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Baking OS",
  description: "레시피 분석 · 가격 비교 · 작업 지시서 자동 생성",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-parchment">{children}</body>
    </html>
  );
}
