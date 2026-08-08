"use client";

import { useEffect, useState } from "react";
import { formatTHB } from "@/lib/utils";
import { bangkokNowISODateTime } from "@/lib/transaction-time";

interface Transaction {
  id: number;
  source: string;
  status: string;
  direction: "in" | "out";
  name: string;
  amount: number;
  note: string | null;
  occurredAt: string;
  year: number;
  month: number;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "รอตรวจสอบ",
  ignored: "ไม่นำมาคิด",
  failed: "ผิดพลาด",
  applied: "บันทึกแล้ว",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  ignored: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  applied: "bg-green-100 text-green-700",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = String(d.getUTCFullYear()).slice(2);
  const hour = String(d.getUTCHours()).padStart(2, "0");
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [fStatus, setFStatus] = useState("");
  const [fDirection, setFDirection] = useState("");
  const [fYearMonth, setFYearMonth] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [fDir, setFDir] = useState<"in" | "out">("out");
  const [fName, setFName] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fOccurredAt, setFOccurredAt] = useState("");
  const [fNote, setFNote] = useState("");
  const [fTxStatus, setFTxStatus] = useState("pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchTransactions() {
    setLoading(true);
    const params = new URLSearchParams();
    if (fStatus) params.set("status", fStatus);
    if (fDirection) params.set("direction", fDirection);
    if (fYearMonth) {
      const [y, m] = fYearMonth.split("-");
      params.set("year", y);
      params.set("month", String(parseInt(m)));
    }
    const qs = params.toString();
    const data = await fetch(`/api/transactions${qs ? `?${qs}` : ""}`).then((r) => r.json());
    setTransactions(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fDirection, fYearMonth]);

  function openAdd() {
    setEditing(null);
    setFDir("out");
    setFName("");
    setFAmount("");
    setFOccurredAt(bangkokNowISODateTime().slice(0, 16));
    setFNote("");
    setFTxStatus("pending");
    setError("");
    setShowForm(true);
  }

  function openEdit(tx: Transaction) {
    setEditing(tx);
    setFDir(tx.direction);
    setFName(tx.name);
    setFAmount(String(tx.amount));
    setFOccurredAt(tx.occurredAt.slice(0, 16));
    setFNote(tx.note || "");
    setFTxStatus(tx.status === "ignored" ? "ignored" : "pending");
    setError("");
    setShowForm(true);
  }

  async function save() {
    if (!fName || !fAmount || !fOccurredAt) return;
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = {
      direction: fDir,
      name: fName,
      amount: Number(fAmount),
      occurredAt: fOccurredAt,
      note: fNote || null,
    };
    if (editing) body.status = fTxStatus;

    const res = await fetch(
      editing ? `/api/transactions/${editing.id}` : "/api/transactions",
      {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const err = await res.json();
      setError(err.error || "บันทึกไม่สำเร็จ");
      setSaving(false);
      return;
    }
    setShowForm(false);
    await fetchTransactions();
    setSaving(false);
  }

  async function deleteTx(id: number, name: string) {
    if (!confirm(`ลบรายการ "${name}"?`)) return;
    const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "ไม่สามารถลบได้");
      return;
    }
    await fetchTransactions();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">ธุรกรรม</h1>
        <button
          onClick={openAdd}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          + เพิ่มรายการ
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">ทุกสถานะ</option>
          <option value="pending">รอตรวจสอบ</option>
          <option value="ignored">ไม่นำมาคิด</option>
          <option value="failed">ผิดพลาด</option>
          <option value="applied">บันทึกแล้ว</option>
        </select>
        <select
          value={fDirection}
          onChange={(e) => setFDirection(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">ทุกประเภท</option>
          <option value="out">รายจ่าย</option>
          <option value="in">รายรับ</option>
        </select>
        <input
          type="month"
          value={fYearMonth}
          onChange={(e) => setFYearMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        {(fStatus || fDirection || fYearMonth) && (
          <button
            onClick={() => { setFStatus(""); setFDirection(""); setFYearMonth(""); }}
            className="text-sm text-gray-400 hover:text-gray-600 px-2"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>
      ) : transactions.length === 0 ? (
        <div className="py-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
          ไม่มีรายการ
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">วันที่-เวลา</th>
                  <th className="text-left px-3 py-3">ประเภท</th>
                  <th className="text-left px-3 py-3">รายการ</th>
                  <th className="text-right px-3 py-3">จำนวนเงิน</th>
                  <th className="text-left px-3 py-3">สถานะ</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDateTime(tx.occurredAt)}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${tx.direction === "in" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {tx.direction === "in" ? "รับ" : "จ่าย"}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-800">
                      {tx.name}
                      {tx.note && <div className="text-xs text-gray-400 font-normal">{tx.note}</div>}
                    </td>
                    <td className={`px-3 py-3 text-right font-medium ${tx.direction === "in" ? "text-green-600" : "text-red-600"}`}>
                      {tx.direction === "in" ? "+" : "-"}{formatTHB(tx.amount)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGE[tx.status] || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABEL[tx.status] || tx.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(tx)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                        <button onClick={() => deleteTx(tx.id, tx.name)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-3">
            {transactions.map((tx) => (
              <div key={tx.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${tx.direction === "in" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {tx.direction === "in" ? "รับ" : "จ่าย"}
                    </span>
                    <span className="font-medium text-gray-800 truncate">{tx.name}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${STATUS_BADGE[tx.status] || "bg-gray-100 text-gray-600"}`}>
                    {STATUS_LABEL[tx.status] || tx.status}
                  </span>
                </div>
                <div className={`text-lg font-bold mt-2 ${tx.direction === "in" ? "text-green-600" : "text-red-600"}`}>
                  {tx.direction === "in" ? "+" : "-"}{formatTHB(tx.amount)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {formatDateTime(tx.occurredAt)}
                  {tx.note && ` · ${tx.note}`}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => openEdit(tx)}
                    className="flex-1 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200"
                  >
                    แก้ไข
                  </button>
                  <button
                    onClick={() => deleteTx(tx.id, tx.name)}
                    className="flex-1 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100"
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold">{editing ? "แก้ไขรายการ" : "เพิ่มรายการ"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">ประเภท *</span>
                  <select
                    value={fDir}
                    onChange={(e) => setFDir(e.target.value as "in" | "out")}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="out">รายจ่าย</option>
                    <option value="in">รายรับ</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">จำนวนเงิน *</span>
                  <input
                    type="number"
                    value={fAmount}
                    onChange={(e) => setFAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500">ชื่อรายการ *</span>
                <input
                  value={fName}
                  onChange={(e) => setFName(e.target.value)}
                  placeholder="เช่น ข้าวเที่ยง"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">วันที่-เวลา *</span>
                <input
                  type="datetime-local"
                  value={fOccurredAt}
                  onChange={(e) => setFOccurredAt(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">โน้ต</span>
                <input
                  value={fNote}
                  onChange={(e) => setFNote(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </label>
              {editing && (
                <label className="block">
                  <span className="text-xs text-gray-500">สถานะ</span>
                  <select
                    value={fTxStatus}
                    onChange={(e) => setFTxStatus(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    <option value="pending">รอตรวจสอบ</option>
                    <option value="ignored">ไม่นำมาคิด</option>
                  </select>
                </label>
              )}
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button
                onClick={save}
                disabled={saving || !fName || !fAmount || !fOccurredAt}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
