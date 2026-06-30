import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Link from "next/link";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Manage Cash",
  description: "ระบบจัดการเงินส่วนตัว Money Jar System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 min-h-screen`}>
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <Link href="/" className="font-bold text-lg text-indigo-600">
                💰 Manage Cash
              </Link>
              <div className="flex gap-4 text-sm">
                <Link href="/" className="text-gray-600 hover:text-indigo-600 transition-colors">หน้าหลัก</Link>
                <Link href="/history" className="text-gray-600 hover:text-indigo-600 transition-colors">ประวัติ</Link>
                <Link href="/salary" className="text-gray-600 hover:text-indigo-600 transition-colors">เงินเดือน</Link>
                <Link href="/jars/manage" className="text-gray-600 hover:text-indigo-600 transition-colors">จัดการ Jar</Link>
                <Link href="/accounts/manage" className="text-gray-600 hover:text-indigo-600 transition-colors">ธนาคาร</Link>
                <Link href="/payment-methods/manage" className="text-gray-600 hover:text-indigo-600 transition-colors">วิธีจ่าย</Link>
                <Link href="/recurring-expenses/manage" className="text-gray-600 hover:text-indigo-600 transition-colors">รายการประจำ</Link>
                <Link href="/deductions/manage" className="text-gray-600 hover:text-indigo-600 transition-colors">รายการหัก</Link>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
