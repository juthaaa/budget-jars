"use client";

import { useEffect, useState } from "react";

interface BankAccount {
  id: number; name: string; color: string;
}

interface PaymentMethod {
  id: number; name: string; code: string; sortOrder: number;
  bankAccountId: number | null;
}

export default function PaymentMethodsManagePage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [fName, setFName] = useState("");
  const [fCode, setFCode] = useState("");
  const [fBankId, setFBankId] = useState<string>("");
  const [fSortOrder, setFSortOrder] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchData() {
    const [ms, accs] = await Promise.all([
      fetch("/api/payment-methods").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]);
    setMethods(ms);
    setAccounts(accs);
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  function bankOf(id: number | null) {
    return id != null ? accounts.find((a) => a.id === id) ?? null : null;
  }

  function openAdd() {
    setEditing(null);
    setFName(""); setFCode(""); setFBankId(""); setFSortOrder("0"); setError("");
    setShowForm(true);
  }

  function openEdit(m: PaymentMethod) {
    setEditing(m);
    setFName(m.name); setFCode(m.code);
    setFBankId(m.bankAccountId != null ? String(m.bankAccountId) : "");
    setFSortOrder(String(m.sortOrder));
    setError(""); setShowForm(true);
  }

  async function save() {
    if (!fName || !fCode) { setError("กรอกชื่อและ code"); return; }
    setSaving(true);
    const body = {
      name: fName,
      code: fCode,
      bankAccountId: fBankId ? parseInt(fBankId) : null,
      sortOrder: parseInt(fSortOrder) || 0,
    };
    const res = editing
      ? await fetch(`/api/payment-methods/${editing.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/payment-methods", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "บันทึกไม่สำเร็จ" }));
      setError(err.error || "บันทึกไม่สำเร็จ");
      setSaving(false);
      return;
    }
    setShowForm(false);
    await fetchData();
    setSaving(false);
  }

  async function deleteMethod(id: number, name: string) {
    if (!confirm(`ลบวิธีจ่าย "${name}"?`)) return;
    const res = await fetch(`/api/payment-methods/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "ลบไม่สำเร็จ" }));
      alert(err.error || "ไม่สามารถลบได้");
      return;
    }
    await fetchData();
  }

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">จัดการวิธีจ่าย (Payment Method)</h1>
        <button onClick={openAdd} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          + เพิ่มวิธีจ่าย
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">ชื่อ</th>
              <th className="text-left px-3 py-3">Code</th>
              <th className="text-left px-3 py-3">ธนาคารที่โอนไป</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {methods.map((m) => {
              const bank = bankOf(m.bankAccountId);
              return (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{m.name}</td>
                  <td className="px-3 py-3 text-gray-500 font-mono text-xs">{m.code}</td>
                  <td className="px-3 py-3">
                    {bank ? (
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ background: bank.color }} />
                        <span className="text-gray-700">{bank.name}</span>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-xs">— ไม่ระบุ —</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(m)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                      <button onClick={() => deleteMethod(m.id, m.name)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold">{editing ? "แก้ไขวิธีจ่าย" : "เพิ่มวิธีจ่าย"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500">ชื่อ *</span>
                <input value={fName} onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น เครดิต, เงินสด"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Code *</span>
                <input value={fCode} onChange={(e) => setFCode(e.target.value.toUpperCase())}
                  placeholder="เช่น CREDIT"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">ธนาคารที่โอนไป (เพื่อสรุปการโอน)</span>
                <select value={fBankId} onChange={(e) => setFBankId(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">— ไม่ระบุ —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">ลำดับ</span>
                <input type="number" value={fSortOrder} onChange={(e) => setFSortOrder(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={save} disabled={saving || !fName || !fCode}
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
