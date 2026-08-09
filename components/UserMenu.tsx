"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function UserMenu() {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setUsername(d?.username ?? null))
      .catch(() => setUsername(null));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (!username) return null;

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="text-gray-500 truncate">👤 {username}</span>
      <button
        onClick={logout}
        className="text-gray-600 hover:text-red-600 transition-colors shrink-0"
      >
        ออกจากระบบ
      </button>
    </div>
  );
}
