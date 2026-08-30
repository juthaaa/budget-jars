"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  History,
  Receipt,
  Wallet,
  PiggyBank,
  Landmark,
  CreditCard,
  Repeat,
  MinusCircle,
  MessageCircle,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  X,
} from "lucide-react";
import UserMenu from "./UserMenu";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: "ธุรกรรม",
    items: [
      { href: "/", label: "หน้าหลัก", icon: Home },
      { href: "/history", label: "ประวัติ", icon: History },
      { href: "/transactions", label: "ธุรกรรม", icon: Receipt },
      { href: "/salary", label: "เงินเดือน", icon: Wallet },
    ],
  },
  {
    title: "ข้อมูลหลัก",
    items: [
      { href: "/jars/manage", label: "จัดการ Jar", icon: PiggyBank },
      { href: "/accounts/manage", label: "ธนาคาร", icon: Landmark },
      { href: "/payment-methods/manage", label: "วิธีจ่าย", icon: CreditCard },
      { href: "/recurring-expenses/manage", label: "รายการประจำ", icon: Repeat },
      { href: "/loans", label: "สินเชื่อบ้าน", icon: Building2 },
      { href: "/deductions/manage", label: "รายการหัก", icon: MinusCircle },
      { href: "/line", label: "เชื่อมต่อ LINE", icon: MessageCircle },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/month/");
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onCloseMobile,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed md:sticky top-0 left-0 h-screen z-[45] md:z-30 flex flex-col
          bg-white border-r border-gray-200 transition-transform duration-200 ease-in-out
          w-64 ${collapsed ? "md:w-16" : "md:w-60"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        {/* Header */}
        <div className="flex items-center h-14 px-3 border-b border-gray-100 shrink-0">
          <Link
            href="/"
            className={`font-bold text-indigo-600 flex items-center gap-2 overflow-hidden ${
              collapsed ? "md:justify-center md:w-full" : ""
            }`}
          >
            <span className="text-lg shrink-0">💰</span>
            <span className={`text-lg whitespace-nowrap ${collapsed ? "md:hidden" : ""}`}>
              Manage Cash
            </span>
          </Link>
          <button
            onClick={onCloseMobile}
            className="ml-auto text-gray-400 hover:text-gray-600 md:hidden"
            aria-label="ปิดเมนู"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div
                className={`px-2 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 ${
                  collapsed ? "md:hidden" : ""
                }`}
              >
                {group.title}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onCloseMobile}
                      title={item.label}
                      className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors
                        ${collapsed ? "md:justify-center" : ""}
                        ${
                          active
                            ? "bg-indigo-50 text-indigo-600"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                      <span className={`truncate ${collapsed ? "md:hidden" : ""}`}>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer: collapse toggle + user menu */}
        <div className="border-t border-gray-100 p-2 shrink-0 space-y-2">
          <button
            onClick={onToggleCollapsed}
            className="hidden md:flex items-center gap-2 w-full rounded-lg px-2.5 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          >
            {collapsed ? (
              <ChevronsRight className="w-[18px] h-[18px] shrink-0" />
            ) : (
              <>
                <ChevronsLeft className="w-[18px] h-[18px] shrink-0" />
                <span>ย่อเมนู</span>
              </>
            )}
          </button>
          <div className={collapsed ? "md:hidden" : ""}>
            <UserMenu />
          </div>
        </div>
      </aside>
    </>
  );
}
