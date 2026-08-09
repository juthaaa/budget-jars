"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";

const COLLAPSE_KEY = "mc-sidebar-collapsed";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Standalone login page: no sidebar/topbar shell.
  if (pathname === "/login") return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 h-14 flex items-center gap-3 px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-600 hover:text-indigo-600 transition-colors"
            aria-label="เปิดเมนู"
          >
            <Menu className="w-6 h-6" />
          </button>
          <span className="font-bold text-indigo-600 flex items-center gap-2 truncate">
            <span>💰</span> Manage Cash
          </span>
        </header>

        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
