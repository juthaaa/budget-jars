"use client";

import { useEffect, useState } from "react";
import { formatNum } from "@/lib/utils";

interface BankAccount { id: number; name: string; color: string }
interface Jar {
  id: number; name: string; code: string; jarType: string;
  isNec: boolean; percentage: number; sortOrder: number;
  rules: string | null; bankAccount: BankAccount | null;
}

export default function JarsManagePage() {
  const [jars, setJars] = useState<Jar[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Jar | null>(null);

  // Form state
  const [fName, setFName] = useState("");
  const [fCode, setFCode] = useState("");
  const [fType, setFType] = useState("a");
  const [fBank, setFBank] = useState<number | "">("");
  const [fPct, setFPct] = useState(0);
  const [fRules, setFRules] = useState("");
  const [fIsNec, setFIsNec] = useState(false);
  const [saving, setSaving] = useState(false);

  async function fetchJars() {
    const [js, accs] = await Promise.all([
      fetch("/api/jars").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]);
    setJars(js);
    setAccounts(accs);
    setLoading(false);
  }

  useEffect(() => { fetchJars(); }, []);

  function openAdd() {
    setEditing(null);
    setFName(""); setFCode(""); setFType("a"); setFBank("");
    setFPct(0); setFRules(""); setFIsNec(false);
    setShowForm(true);
  }

  function openEdit(jar: Jar) {
    setEditing(jar);
    setFName(jar.name); setFCode(jar.code); setFType(jar.jarType);
    setFBank(jar.bankAccount?.id || ""); setFPct(jar.percentage);
    setFRules(jar.rules || ""); setFIsNec(jar.isNec);
    setShowForm(true);
  }

  async function saveJar() {
    if (!fName || !fCode) return;
    setSaving(true);
    const body = {
      name: fName, code: fCode, jarType: fType, bankAccountId: fBank || null,
      percentage: fPct, rules: fRules, isNec: fIsNec,
      sortOrder: editing?.sortOrder ?? 99,
    };
    if (editing) {
      await fetch(`/api/jars/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/jars", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowForm(false);
    await fetchJars();
    setSaving(false);
  }

  async function deleteJar(id: number, name: string) {
    if (!confirm(`ลบ jar "${name}"? ข้อมูลการจัดสรรที่เกี่ยวข้องจะถูกลบด้วย`)) return;
    await fetch(`/api/jars/${id}`, { method: "DELETE" });
    await fetchJars();
  }

  const totalPct = jars.filter((j) => !j.isNec).reduce((s, j) => s + j.percentage, 0);

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">จัดการ Jar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            % รวม (ไม่รวม NEC): {formatNum(totalPct)}%
            {totalPct > 100 && <span className="text-red-500 ml-2">⚠ เกิน 100%</span>}
          </p>
        </div>
        <button
          onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          + เพิ่ม Jar
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">ชื่อ Jar</th>
              <th className="text-left px-3 py-3">Code</th>
              <th className="text-left px-3 py-3">Type</th>
              <th className="text-right px-3 py-3">%</th>
              <th className="text-left px-3 py-3">ธนาคาร</th>
              <th className="text-left px-3 py-3">กฎ</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jars.map((jar) => (
              <tr key={jar.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {jar.name}
                  {jar.isNec && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">NEC</span>}
                </td>
                <td className="px-3 py-3">
                  <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-mono">{jar.code}</span>
                </td>
                <td className="px-3 py-3 text-gray-500">
                  {jar.jarType === "r" ? "🔒 ออมทรัพย์" : "💳 ใช้จ่าย"}
                </td>
                <td className="px-3 py-3 text-right text-gray-700 font-medium">
                  {jar.isNec ? "—" : `${jar.percentage}%`}
                </td>
                <td className="px-3 py-3">
                  {jar.bankAccount ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ background: jar.bankAccount.color }}
                      />
                      {jar.bankAccount.name}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-3 py-3 text-gray-400 text-xs max-w-[180px] truncate">{jar.rules || ""}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(jar)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                    <button onClick={() => deleteJar(jar.id, jar.name)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
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
              <h3 className="font-semibold">{editing ? "แก้ไข Jar" : "เพิ่ม Jar"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">ชื่อ *</span>
                  <input value={fName} onChange={(e) => setFName(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Code *</span>
                  <input value={fCode} onChange={(e) => setFCode(e.target.value.toUpperCase())} disabled={!!editing}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">ประเภท</span>
                  <select value={fType} onChange={(e) => setFType(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="a">💳 ใช้จ่าย (active)</option>
                    <option value="r">🔒 ออมทรัพย์ (restricted)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">% จัดสรร</span>
                  <input type="number" value={fPct} onChange={(e) => setFPct(parseFloat(e.target.value) || 0)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  {!fIsNec && <p className="text-xs text-gray-400 mt-0.5">% ของ (Net - NEC)</p>}
                  {fIsNec && <p className="text-xs text-amber-500 mt-0.5">% ของ Net สำหรับ default NEC</p>}
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500">ธนาคาร</span>
                <select value={fBank} onChange={(e) => setFBank(e.target.value ? parseInt(e.target.value) : "")}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">— ไม่ระบุ —</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">กฎการใช้งาน</span>
                <input value={fRules} onChange={(e) => setFRules(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={fIsNec} onChange={(e) => setFIsNec(e.target.checked)}
                  className="rounded" />
                <span className="text-sm text-gray-700">เป็น NEC jar (ค่าใช้จ่ายประจำวัน)</span>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={saveJar} disabled={saving || !fName || !fCode}
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
