"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTHB, MONTH_TH, yearMonthKey } from "@/lib/utils";

interface MonthSummary {
  id: number;
  year: number;
  month: number;
  necAmount: number;
  reconciled: boolean;
  expenses: { amount: number }[];
  // computed by API from child records
  grossIncome: number;
  taxWithheld: number;
  netIncome: number;
}

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

// ---- Create Month Modal ----
function CreateMonthModal({
  existingMonths,
  onCreated,
  onClose,
}: {
  existingMonths: MonthSummary[];
  onCreated: () => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const alreadyExists = existingMonths.some(
    (m) => m.year === year && m.month === month
  );

  async function handleCreate() {
    if (alreadyExists) return;
    setCreating(true);
    setError("");
    const res = await fetch("/api/months", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year, month }),
    });
    if (res.ok) {
      window.location.href = `/month/${yearMonthKey(year, month)}`;
    } else {
      const err = await res.json();
      setError(err.error || "เกิดข้อผิดพลาด");
      setCreating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl p-6 w-80 shadow-xl space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">เปิดเดือนใหม่</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">เดือน</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {MONTH_TH.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ปี (ค.ศ.)</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min={2000}
              max={2100}
            />
          </div>
        </div>

        <p className="text-xs text-gray-400">
          พ.ศ. {year + 543} — {MONTH_TH[month - 1]}
        </p>

        {alreadyExists && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
            เดือนนี้มีข้อมูลอยู่แล้ว
          </p>
        )}
        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || alreadyExists}
            className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {creating ? "กำลังสร้าง..." : "สร้างเดือน"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Edit Month/Year Modal ----
function EditMonthModal({
  record,
  existingMonths,
  onSaved,
  onClose,
}: {
  record: MonthSummary;
  existingMonths: MonthSummary[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(record.year);
  const [month, setMonth] = useState(record.month);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const unchanged = year === record.year && month === record.month;
  const conflict = !unchanged && existingMonths.some(
    (m) => m.year === year && m.month === month && m.id !== record.id
  );

  async function handleSave() {
    if (unchanged || conflict) return;
    setSaving(true);
    setError("");
    const res = await fetch(
      `/api/months/${yearMonthKey(record.year, record.month)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newYear: year, newMonth: month }),
      }
    );
    if (res.ok) {
      onSaved();
      onClose();
    } else {
      const err = await res.json();
      setError(err.error || "เกิดข้อผิดพลาด");
    }
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl p-6 w-80 shadow-xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">แก้ไขเดือน/ปี</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            เดิม: {MONTH_TH[record.month - 1]} {record.year + 543}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">เดือน</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {MONTH_TH.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">ปี (ค.ศ.)</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              min={2000}
              max={2100}
            />
          </div>
        </div>

        <p className="text-xs text-gray-400">
          ใหม่: {MONTH_TH[month - 1]} พ.ศ. {year + 543}
        </p>

        {conflict && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
            เดือนนั้นมีข้อมูลอยู่แล้ว
          </p>
        )}
        {error && (
          <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving || unchanged || conflict}
            className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Delete Month Modal ----
function DeleteMonthModal({
  record,
  onDeleted,
  onClose,
}: {
  record: MonthSummary;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (confirmText !== "Delete") return;
    setDeleting(true);
    await fetch(`/api/months/${yearMonthKey(record.year, record.month)}`, {
      method: "DELETE",
    });
    onDeleted();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl p-6 w-80 shadow-xl space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">ลบข้อมูลเดือน</h2>
          <p className="text-sm text-gray-500 mt-1">
            {MONTH_TH[record.month - 1]} พ.ศ. {record.year + 543}
          </p>
        </div>
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          ข้อมูลรายจ่ายทั้งหมดในเดือนนี้จะถูกลบถาวร
        </p>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">
            พิมพ์ <span className="font-mono font-semibold text-gray-800">Delete</span> เพื่อยืนยัน
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Delete"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            autoFocus
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleDelete}
            disabled={confirmText !== "Delete" || deleting}
            className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {deleting ? "กำลังลบ..." : "ลบ"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Main Dashboard ----
export default function DashboardPage() {
  const [months, setMonths] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editRecord, setEditRecord] = useState<MonthSummary | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<MonthSummary | null>(null);
  const [filterYear, setFilterYear] = useState<number | "all">(CURRENT_YEAR);
  const [showAll, setShowAll] = useState(false);

  function loadMonths() {
    setLoading(true);
    fetch("/api/months")
      .then((r) => r.json())
      .then(setMonths)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadMonths();
  }, []);

  const availableYears = Array.from(new Set(months.map((m) => m.year))).sort(
    (a, b) => b - a
  );

  const filtered = months
    .filter((m) => filterYear === "all" || m.year === filterYear)
    .filter((m) => showAll || !m.reconciled);

  async function toggleReconcile(record: MonthSummary) {
    const newVal = !record.reconciled;
    setMonths((prev) => prev.map((m) => m.id === record.id ? { ...m, reconciled: newVal } : m));
    await fetch(`/api/months/${yearMonthKey(record.year, record.month)}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reconciled: newVal }),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        กำลังโหลด...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ภาพรวม</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            ระบบจัดการเงินส่วนตัว Money Jar System
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          + เปิดเดือนใหม่
        </button>
      </div>

      {/* Filter + Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Filter bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <span className="text-sm font-medium text-gray-700">
            ทั้งหมด {months.length} เดือน
          </span>
          <div className="ml-auto flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showAll}
                onChange={(e) => setShowAll(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
              />
              แสดงทั้งหมด
            </label>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">ปี</label>
              <select
                value={filterYear}
                onChange={(e) =>
                  setFilterYear(
                    e.target.value === "all" ? "all" : Number(e.target.value)
                  )
                }
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="all">ทั้งหมด</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y + 543}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs">
              <th className="text-left px-4 py-2.5 font-medium">เดือน</th>
              <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">ปี</th>
              <th className="text-right px-4 py-2.5 font-medium">รายรับสุทธิ</th>
              <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">รายจ่าย</th>
              <th className="text-right px-4 py-2.5 font-medium hidden md:table-cell">คงเหลือ</th>
              <th className="text-center px-4 py-2.5 font-medium w-24">สถานะ</th>
              <th className="text-center px-4 py-2.5 font-medium w-20">Reconcile</th>
              <th className="px-4 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((m) => {
              const totalExp = m.expenses.reduce((s, e) => s + e.amount, 0);
              const netIncome = m.netIncome;
              const remaining = netIncome - totalExp;
              const ratio = netIncome > 0 ? totalExp / netIncome : 0;
              const isCurrentMonth =
                m.year === CURRENT_YEAR && m.month === CURRENT_MONTH;

              const statusColor =
                ratio > 0.9
                  ? "bg-red-100 text-red-700"
                  : ratio > 0.7
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-green-100 text-green-700";
              const statusText =
                ratio > 0.9 ? "เกิน" : ratio > 0.7 ? "ใกล้เต็ม" : "ปกติ";

              return (
                <tr
                  key={m.id}
                  className={`hover:bg-gray-50 transition-colors ${
                    isCurrentMonth ? "bg-indigo-50/50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">
                        {MONTH_TH[m.month - 1]}
                      </span>
                      {isCurrentMonth && (
                        <span className="text-xs text-indigo-500 font-medium">
                          ● ปัจจุบัน
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                    {m.year + 543}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatTHB(netIncome)}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600 hidden md:table-cell">
                    {formatTHB(totalExp)}
                  </td>
                  <td className={`px-4 py-3 text-right hidden md:table-cell font-medium ${remaining >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {formatTHB(remaining)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.netIncome > 0 && (
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}
                      >
                        {statusText}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={m.reconciled}
                      onChange={() => toggleReconcile(m)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-400 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setEditRecord(m)}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                        title="แก้ไขเดือน/ปี"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setDeleteRecord(m)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="ลบเดือนนี้"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <Link
                        href={`/month/${yearMonthKey(m.year, m.month)}`}
                        className="text-indigo-600 hover:text-indigo-800 font-medium text-xs transition-colors"
                      >
                        เปิด →
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  ไม่มีข้อมูล
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateMonthModal
          existingMonths={months}
          onCreated={loadMonths}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editRecord && (
        <EditMonthModal
          record={editRecord}
          existingMonths={months}
          onSaved={loadMonths}
          onClose={() => setEditRecord(null)}
        />
      )}
      {deleteRecord && (
        <DeleteMonthModal
          record={deleteRecord}
          onDeleted={loadMonths}
          onClose={() => setDeleteRecord(null)}
        />
      )}
    </div>
  );
}
