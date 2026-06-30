"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import UserMenu from "./UserMenu";

const LINKS = [
  { href: "/", label: "หน้าหลัก" },
  { href: "/history", label: "ประวัติ" },
  { href: "/salary", label: "เงินเดือน" },
  { href: "/jars/manage", label: "จัดการ Jar" },
  { href: "/accounts/manage", label: "ธนาคาร" },
  { href: "/payment-methods/manage", label: "วิธีจ่าย" },
  { href: "/recurring-expenses/manage", label: "รายการประจำ" },
  { href: "/deductions/manage", label: "รายการหัก" },
];

export default function NavBar() {
  const pathname = usePathname();

  // No navbar on the standalone login page.
  if (pathname === "/login") return null;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          <Link href="/" className="font-bold text-lg text-indigo-600">
            💰 Manage Cash
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex gap-4">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="text-gray-600 hover:text-indigo-600 transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <UserMenu />
          </div>
        </div>
      </div>
    </nav>
  );
}
