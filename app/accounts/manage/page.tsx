"use client";

import { useEffect, useState } from "react";

interface BankAccount {
  id: number; name: string; accountNumber: string | null; color: string;
}

const PRESET_COLORS = [
  "#1d4ed8", "#15803d", "#7e22ce", "#0369a1",
  "#fbbf24", "#ea580c", "#16a34a", "#db2777",
  "#374151", "#0891b2",
];

export default function AccountsManagePage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [fName, setFName] = useState("");
  const [fAccNum, setFAccNum] = useState("");
  const [fColor, setFColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchAccounts() {
    const data = await fetch("/api/accounts").then((r) => r.json());
    setAccounts(data);
    setLoading(false);
  }

  useEffect(() => { fetchAccounts(); }, []);

  function openAdd() {
    setEditing(null);
    setFName(""); setFAccNum(""); setFColor("#6366f1"); setError("");
    setShowForm(true);
  }

  function openEdit(acc: BankAccount) {
    setEditing(acc);
    setFName(acc.name); setFAccNum(acc.accountNumber || ""); setFColor(acc.color);
    setError(""); setShowForm(true);
  }

  async function save() {
    if (!fName) return;
    setSaving(true);
    const body = { name: fName, accountNumber: fAccNum || null, color: fColor };
    if (editing) {
      await fetch(`/api/accounts/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/accounts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowForm(false);
    await fetchAccounts();
    setSaving(false);
  }

  async function deleteAccount(id: number, name: string) {
    if (!confirm(`ลบธนาคาร "${name}"?`)) return;
    const res = await fetch(`/api/accounts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "ไม่สามารถลบได้");
      return;
    }
    await fetchAccounts();
  }

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">จัดการธนาคาร / บัญชี</h1>
        <button onClick={openAdd} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          + เพิ่มธนาคาร
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">ธนาคาร</th>
              <th className="text-left px-3 py-3">เลขบัญชี</th>
              <th className="text-left px-3 py-3">สี</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {accounts.map((acc) => (
              <tr key={acc.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: acc.color }} />
                    {acc.name}
                  </div>
                </td>
                <td className="px-3 py-3 text-gray-500 font-mono text-xs">{acc.accountNumber || "—"}</td>
                <td className="px-3 py-3">
                  <span className="text-xs font-mono text-gray-400">{acc.color}</span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(acc)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                    <button onClick={() => deleteAccount(acc.id, acc.name)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold">{editing ? "แก้ไขธนาคาร" : "เพิ่มธนาคาร"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500">ชื่อธนาคาร *</span>
                <input value={fName} onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น KBANK, SCB"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">เลขบัญชี</span>
                <input value={fAccNum} onChange={(e) => setFAccNum(e.target.value)}
                  placeholder="xxx-x-xxxxx-x"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <div>
                <span className="text-xs text-gray-500">สี</span>
                <div className="flex gap-2 mt-1.5 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button key={c} onClick={() => setFColor(c)}
                      className={`w-7 h-7 rounded-full border-2 ${fColor === c ? "border-gray-800 scale-110" : "border-transparent"} transition-transform`}
                      style={{ background: c }} />
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="color" value={fColor} onChange={(e) => setFColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border border-gray-200" />
                  <span className="text-xs font-mono text-gray-500">{fColor}</span>
                </div>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={save} disabled={saving || !fName}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
