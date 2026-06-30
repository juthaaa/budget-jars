"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { formatTHB, formatNum } from "@/lib/utils";

interface SalaryRecord {
  id: number;
  effectiveDate: string;
  amount: number;
}

export default function SalaryPage() {
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalaryRecord | null>(null);
  const [fDate, setFDate] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function fetchSalary() {
    const data = await fetch("/api/salary").then((r) => r.json());
    setRecords(data);
    setLoading(false);
  }

  useEffect(() => { fetchSalary(); }, []);

  const chartData = records.map((r) => ({
    label: new Date(r.effectiveDate).toLocaleDateString("th-TH", { month: "short", year: "2-digit" }),
    amount: r.amount,
  }));

  // Derive per-record increase from previous record (sorted ascending by effectiveDate)
  const increaseById = (() => {
    const m = new Map<number, { amount: number | null; percent: number | null }>();
    const sortedAsc = [...records].sort(
      (a, b) => new Date(a.effectiveDate).getTime() - new Date(b.effectiveDate).getTime(),
    );
    for (let i = 0; i < sortedAsc.length; i++) {
      const cur = sortedAsc[i];
      const prev = i > 0 ? sortedAsc[i - 1] : null;
      if (!prev) {
        m.set(cur.id, { amount: null, percent: null });
      } else {
        const diff = cur.amount - prev.amount;
        const pct = prev.amount > 0 ? (diff / prev.amount) * 100 : null;
        m.set(cur.id, { amount: diff, percent: pct });
      }
    }
    return m;
  })();

  function openAdd() {
    setEditing(null);
    setFDate(new Date().toISOString().slice(0, 10));
    setFAmount("");
    setShowForm(true);
  }

  function openEdit(rec: SalaryRecord) {
    setEditing(rec);
    setFDate(rec.effectiveDate.slice(0, 10));
    setFAmount(String(rec.amount));
    setShowForm(true);
  }

  async function save() {
    if (!fDate || !fAmount) return;
    setSaving(true);
    const body = { effectiveDate: fDate, amount: fAmount };
    if (editing) {
      await fetch(`/api/salary/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/salary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowForm(false);
    await fetchSalary();
    setSaving(false);
  }

  async function deleteSalary(id: number) {
    if (!confirm("ลบข้อมูลเงินเดือนนี้?")) return;
    await fetch(`/api/salary/${id}`, { method: "DELETE" });
    await fetchSalary();
  }

  const latest = records[records.length - 1];

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ประวัติเงินเดือน</h1>
          {latest && (
            <p className="text-sm text-gray-500 mt-0.5">
              ปัจจุบัน: <span className="font-semibold text-gray-800">{formatTHB(latest.amount)}</span>
            </p>
          )}
        </div>
        <button onClick={openAdd} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          + เพิ่มข้อมูล
        </button>
      </div>

      {/* Line chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">แนวโน้มเงินเดือน</h2>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatTHB(Number(v))} />
            <Line type="stepAfter" dataKey="amount" name="เงินเดือน" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">วันที่มีผล</th>
              <th className="text-right px-3 py-3">เงินเดือน</th>
              <th className="text-right px-3 py-3">เพิ่มขึ้น</th>
              <th className="text-right px-3 py-3">%เพิ่ม</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {[...records].reverse().map((rec) => {
              const inc = increaseById.get(rec.id);
              return (
              <tr key={rec.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-800">
                  {new Date(rec.effectiveDate).toLocaleDateString("th-TH", {
                    day: "numeric", month: "long", year: "numeric"
                  })}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatTHB(rec.amount)}</td>
                <td className="px-3 py-2.5 text-right text-green-600">
                  {inc?.amount != null ? `+${formatNum(inc.amount)}` : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-green-600">
                  {inc?.percent != null ? `+${inc.percent.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => openEdit(rec)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                    <button onClick={() => deleteSalary(rec.id)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
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
          <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold">{editing ? "แก้ไขเงินเดือน" : "เพิ่มเงินเดือน"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500">วันที่มีผล *</span>
                <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">จำนวนเงินเดือน (บาท) *</span>
                <input type="number" value={fAmount} onChange={(e) => setFAmount(e.target.value)}
                  placeholder="42490"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={save} disabled={saving || !fDate || !fAmount}
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
