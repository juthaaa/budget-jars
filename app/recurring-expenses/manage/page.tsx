"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { GripVertical, ChevronDown, ChevronRight } from "lucide-react";
import { formatTHB, formatNum, MONTH_TH_SHORT } from "@/lib/utils";

interface ExpenseMaster {
  id: number;
  name: string;
  defaultJarCode: string | null;
}

interface PaymentMethod {
  id: number;
  name: string;
  code: string;
  sortOrder: number;
}

interface RecurringExpense {
  id: number;
  expenseMasterId: number;
  expenseMaster: ExpenseMaster;
  amount: number;
  startDate: string | null;
  endDate: string | null;
  paymentMethodId: number | null;
  paymentMethod: { id: number; name: string } | null;
  sortOrder: number;
  intervalValue: number;
  intervalUnit: string;
  note: string | null;
}

interface InstallmentItem {
  id: number;
  installmentNumber: number;
  amount: number;
  startDate: string;
  _count?: { expenses: number };
}

interface InstallmentPlan {
  id: number;
  expenseMasterId: number;
  expenseMaster: ExpenseMaster;
  principalAmount: number;
  totalInstallments: number;
  interestRate: number;
  interestUnit: string;
  paymentMethodId: number | null;
  paymentMethod: { id: number; name: string } | null;
  startDate: string;
  note: string | null;
  items: InstallmentItem[];
}

interface PreviewRow {
  num: number;
  monthDate: Date;
  amount: number;
  principal: number;
  interest: number;
  remaining: number;
}

function formatThaiDate(iso: string | null): string {
  if (!iso) return "ตลอดไป";
  const d = new Date(iso);
  return `${MONTH_TH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

function methodLabel(pm: { name: string } | null): { text: string; cls: string } {
  if (!pm) return { text: "—", cls: "bg-gray-100 text-gray-400" };
  return { text: pm.name, cls: "bg-indigo-100 text-indigo-700" };
}

function frequencyLabel(value: number, unit: string): string {
  if (unit === "year") return value === 1 ? "ทุกปี" : `ทุก ${value} ปี`;
  return value === 1 ? "ทุกเดือน" : `ทุก ${value} เดือน`;
}

function buildPreview(
  principal: number,
  n: number,
  rate: number,
  rateUnit: "month" | "year",
  startDateStr: string
): PreviewRow[] {
  if (!principal || principal <= 0 || !n || n < 1 || !startDateStr) return [];
  const monthlyRate = rateUnit === "year" ? rate / 12 / 100 : rate / 100;
  const sd = new Date(startDateStr);
  const sy = sd.getUTCFullYear();
  const sm = sd.getUTCMonth();
  const rows: PreviewRow[] = [];
  let balance = principal;

  if (monthlyRate <= 0) {
    const base = Math.round((principal / n) * 100) / 100;
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      const amt = isLast ? Math.round((principal - base * i) * 100) / 100 : base;
      rows.push({
        num: i + 1,
        monthDate: new Date(Date.UTC(sy, sm + i, 1)),
        amount: amt, principal: amt, interest: 0,
        remaining: isLast ? 0 : Math.round((principal - base * (i + 1)) * 100) / 100,
      });
    }
  } else {
    const fp = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
    for (let i = 0; i < n; i++) {
      const interest = Math.round(balance * monthlyRate * 100) / 100;
      const isLast = i === n - 1;
      const principalPaid = isLast ? balance : Math.round((fp - interest) * 100) / 100;
      const amt = Math.round((principalPaid + interest) * 100) / 100;
      balance = Math.round((balance - principalPaid) * 100) / 100;
      rows.push({
        num: i + 1,
        monthDate: new Date(Date.UTC(sy, sm + i, 1)),
        amount: amt, principal: principalPaid, interest,
        remaining: Math.max(0, balance),
      });
    }
  }
  return rows;
}

export default function RecurringExpensesManagePage() {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [masters, setMasters] = useState<ExpenseMaster[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null);

  // Regular recurring form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [fMasterId, setFMasterId] = useState("");
  const [fAmount, setFAmount] = useState("");
  const [fStart, setFStart] = useState("");
  const [fEnd, setFEnd] = useState("");
  const [fMethodId, setFMethodId] = useState<string>("");
  const [fIntervalValue, setFIntervalValue] = useState("1");
  const [fIntervalUnit, setFIntervalUnit] = useState<"month" | "year">("month");
  const [fNote, setFNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Drag state
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Installment plan form
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [editingMaxSeeded, setEditingMaxSeeded] = useState(0);
  const [iPMasterId, setIPMasterId] = useState("");
  const [iPMasterName, setIPMasterName] = useState("");
  const [iPMasterOpen, setIPMasterOpen] = useState(false);
  const [iPMasterCreateNew, setIPMasterCreateNew] = useState(false);
  const [iPNote, setIPNote] = useState("");
  const [iPPrincipal, setIPPrincipal] = useState("");
  const [iPInstallments, setIPInstallments] = useState("");
  const [iPRate, setIPRate] = useState("0");
  const [iPRateUnit, setIPRateUnit] = useState<"month" | "year">("month");
  const [iPMethodId, setIPMethodId] = useState<string>("");
  const [iPStartDate, setIPStartDate] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  const previewRows = useMemo<PreviewRow[]>(() => {
    return buildPreview(
      parseFloat(iPPrincipal), parseInt(iPInstallments),
      parseFloat(iPRate) || 0, iPRateUnit, iPStartDate
    );
  }, [iPPrincipal, iPInstallments, iPRate, iPRateUnit, iPStartDate]);

  async function fetchAll() {
    const [its, ps, ms, pms] = await Promise.all([
      fetch("/api/recurring-expenses").then((r) => r.json()),
      fetch("/api/installment-plans").then((r) => r.json()),
      fetch("/api/expense-master").then((r) => r.json()),
      fetch("/api/payment-methods").then((r) => r.json()),
    ]);
    setItems(its);
    setPlans(ps);
    setMasters(ms);
    setPaymentMethods(pms);
    setLoading(false);
  }

  useEffect(() => { fetchAll(); }, []);

  function openAdd() {
    setEditing(null);
    setFMasterId(masters[0]?.id ? String(masters[0].id) : "");
    setFAmount(""); setFStart(""); setFEnd("");
    setFMethodId(""); setFIntervalValue("1"); setFIntervalUnit("month"); setFNote("");
    setShowForm(true);
  }

  function openEdit(it: RecurringExpense) {
    setEditing(it);
    setFMasterId(String(it.expenseMasterId));
    setFAmount(String(it.amount));
    setFStart(it.startDate ? it.startDate.slice(0, 10) : "");
    setFEnd(it.endDate ? it.endDate.slice(0, 10) : "");
    setFMethodId(it.paymentMethod ? String(it.paymentMethod.id) : "");
    setFIntervalValue(String(it.intervalValue ?? 1));
    setFIntervalUnit((it.intervalUnit as "month" | "year") ?? "month");
    setFNote(it.note ?? "");
    setShowForm(true);
  }

  async function save() {
    if (!fMasterId || !fAmount) return;
    setSaving(true);
    const body = {
      expenseMasterId: parseInt(fMasterId),
      amount: parseFloat(fAmount) || 0,
      startDate: fStart || null,
      endDate: fEnd || null,
      paymentMethodId: fMethodId ? parseInt(fMethodId) : null,
      sortOrder: editing ? editing.sortOrder : items.length,
      intervalValue: parseInt(fIntervalValue) || 1,
      intervalUnit: fIntervalUnit,
      note: fNote.trim() || null,
    };
    if (editing) {
      await fetch(`/api/recurring-expenses/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/recurring-expenses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setShowForm(false);
    await fetchAll();
    setSaving(false);
  }

  async function deleteItem(id: number, name: string) {
    if (!confirm(`ลบรายการประจำ "${name}"?`)) return;
    await fetch(`/api/recurring-expenses/${id}`, { method: "DELETE" });
    await fetchAll();
  }

  // Drag handlers
  function handleDragStart(index: number) { dragIndex.current = index; }
  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex.current !== null && dragIndex.current !== index) setDragOverIndex(index);
  }
  function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === dropIndex) { dragIndex.current = null; setDragOverIndex(null); return; }
    const newItems = [...items];
    const [moved] = newItems.splice(from, 1);
    newItems.splice(dropIndex, 0, moved);
    const reordered = newItems.map((item, i) => ({ ...item, sortOrder: i }));
    setItems(reordered);
    dragIndex.current = null; setDragOverIndex(null);
    reordered.forEach((item, i) => {
      if (items[i]?.id !== item.id) {
        fetch(`/api/recurring-expenses/${item.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: i }),
        });
      }
    });
  }
  function handleDragEnd() { dragIndex.current = null; setDragOverIndex(null); }

  // Installment plan handlers
  function openPlanModal() {
    setEditingPlanId(null);
    setEditingMaxSeeded(0);
    setIPMasterId(masters[0]?.id ? String(masters[0].id) : "");
    setIPMasterName(masters[0]?.name ?? "");
    setIPMasterCreateNew(false);
    setIPPrincipal(""); setIPInstallments(""); setIPRate("0");
    setIPRateUnit("month"); setIPMethodId(""); setIPStartDate(""); setIPNote("");
    setShowPlanModal(true);
  }

  function openEditPlan(plan: InstallmentPlan) {
    const maxSeeded = plan.items.reduce((m, item) =>
      (item._count?.expenses ?? 0) > 0 ? Math.max(m, item.installmentNumber) : m
    , 0);
    setEditingPlanId(plan.id);
    setEditingMaxSeeded(maxSeeded);
    setIPMasterId(String(plan.expenseMasterId));
    setIPMasterName(plan.expenseMaster.name);
    setIPPrincipal(String(plan.principalAmount));
    setIPInstallments(String(plan.totalInstallments));
    setIPRate(String(plan.interestRate));
    setIPRateUnit(plan.interestUnit as "month" | "year");
    setIPMethodId(plan.paymentMethod ? String(plan.paymentMethod.id) : "");
    setIPStartDate(plan.startDate.slice(0, 10));
    setIPNote(plan.note ?? "");
    setShowPlanModal(true);
  }

  function closePlanModal() {
    setShowPlanModal(false);
    setEditingPlanId(null);
    setEditingMaxSeeded(0);
    setIPMasterId("");
    setIPMasterName("");
    setIPMasterCreateNew(false);
    setIPNote("");
  }

  async function savePlan() {
    const trimmedName = iPMasterName.trim();
    if ((!iPMasterId && !trimmedName) || !iPPrincipal || !iPInstallments || !iPStartDate) return;
    setSavingPlan(true);
    let resolvedMasterId = iPMasterId ? parseInt(iPMasterId) : 0;
    if (!resolvedMasterId && trimmedName) {
      const existing = masters.find((m) => m.name.toLowerCase() === trimmedName.toLowerCase());
      if (existing) {
        resolvedMasterId = existing.id;
      } else if (iPMasterCreateNew) {
        const res = await fetch("/api/expense-master", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName }),
        });
        const newMaster = await res.json();
        resolvedMasterId = newMaster.id;
      }
    }
    const payload = {
      expenseMasterId: resolvedMasterId,
      principalAmount: parseFloat(iPPrincipal),
      totalInstallments: parseInt(iPInstallments),
      interestRate: parseFloat(iPRate) || 0,
      interestUnit: iPRateUnit,
      paymentMethodId: iPMethodId ? parseInt(iPMethodId) : null,
      startDate: iPStartDate,
      note: iPNote.trim() || null,
    };
    if (editingPlanId) {
      const res = await fetch(`/api/installment-plans/${editingPlanId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "เกิดข้อผิดพลาด");
        setSavingPlan(false);
        return;
      }
    } else {
      await fetch("/api/installment-plans", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    closePlanModal();
    await fetchAll();
    setSavingPlan(false);
  }

  async function deletePlan(id: number, name: string) {
    if (!confirm(`ลบรายการผ่อน "${name}" และงวดทั้งหมด?`)) return;
    await fetch(`/api/installment-plans/${id}`, { method: "DELETE" });
    await fetchAll();
  }

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  const totalPreview = previewRows.reduce((s, r) => s + r.amount, 0);
  const totalInterest = previewRows.reduce((s, r) => s + r.interest, 0);
  // Expense Type is locked once any installment of the edited plan has been seeded.
  const masterLocked = editingPlanId !== null && editingMaxSeeded > 0;

  return (
    <div className="space-y-8">
      {/* ===== Section 1: Regular Recurring ===== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">รายการประจำ</h1>
            <p className="text-sm text-gray-500 mt-0.5">ดึงเข้า Expense อัตโนมัติเมื่อเปิดเดือนใหม่ ตามความถี่ที่กำหนด</p>
          </div>
          <button onClick={openAdd} disabled={masters.length === 0}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
            + เพิ่มรายการ
          </button>
        </div>

        {masters.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
            ยังไม่มี Expense Type — สร้าง ExpenseMaster ก่อน (ผ่าน API <code className="font-mono text-xs">/api/expense-master</code> หรือ <code className="font-mono text-xs">npx tsx scripts/seed-expense-masters.ts</code>)
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {items.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">ยังไม่มีรายการประจำ</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="w-8 px-2 py-3"></th>
                  <th className="text-left px-4 py-3">ชื่อ</th>
                  <th className="text-left px-3 py-3">Jar</th>
                  <th className="text-right px-3 py-3">ยอด</th>
                  <th className="text-center px-3 py-3">ความถี่</th>
                  <th className="text-left px-3 py-3">เริ่ม</th>
                  <th className="text-left px-3 py-3">สิ้นสุด</th>
                  <th className="text-center px-3 py-3">วิธีจ่าย</th>
                  <th className="text-left px-3 py-3">หมายเหตุ</th>
                  <th className="px-3 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it, index) => {
                  const m = methodLabel(it.paymentMethod);
                  const isDragOver = dragOverIndex === index;
                  return (
                    <tr key={it.id} draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`hover:bg-gray-50 transition-colors ${isDragOver ? "border-t-2 border-indigo-400 bg-indigo-50/40" : ""}`}>
                      <td className="px-2 py-3 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
                        <GripVertical size={16} />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">{it.expenseMaster.name}</td>
                      <td className="px-3 py-3 text-gray-500 font-mono text-xs">{it.expenseMaster.defaultJarCode ?? "—"}</td>
                      <td className="px-3 py-3 text-right font-semibold text-gray-900">{formatTHB(it.amount)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {frequencyLabel(it.intervalValue ?? 1, it.intervalUnit ?? "month")}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{formatThaiDate(it.startDate)}</td>
                      <td className="px-3 py-3 text-gray-600">{formatThaiDate(it.endDate)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.cls}`}>{m.text}</span>
                      </td>
                      <td className="px-3 py-3 text-gray-400 text-xs max-w-[160px] truncate" title={it.note ?? ""}>{it.note ?? "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => openEdit(it)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                          <button onClick={() => deleteItem(it.id, it.expenseMaster.name)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== Section 2: Installment Plans ===== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">รายการผ่อน</h2>
            <p className="text-sm text-gray-500 mt-0.5">ระบบจะแตกเป็นรายการย่อยตามจำนวนงวด พร้อมคำนวณดอกเบี้ยให้อัตโนมัติ</p>
          </div>
          <button onClick={openPlanModal} disabled={masters.length === 0}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
            + สร้างรายการผ่อน
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {plans.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">ยังไม่มีรายการผ่อน</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="w-8 px-3 py-3"></th>
                  <th className="text-left px-4 py-3">ชื่อ</th>
                  <th className="text-right px-3 py-3">เงินต้น</th>
                  <th className="text-center px-3 py-3">งวด</th>
                  <th className="text-center px-3 py-3">ดอกเบี้ย</th>
                  <th className="text-left px-3 py-3">เริ่ม</th>
                  <th className="text-center px-3 py-3">วิธีจ่าย</th>
                  <th className="text-left px-3 py-3">หมายเหตุ</th>
                  <th className="px-3 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const m = methodLabel(plan.paymentMethod);
                  const isExpanded = expandedPlanId === plan.id;
                  return (
                    <>
                      <tr key={plan.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-3 text-center">
                          <button onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                            className="text-gray-400 hover:text-gray-600">
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-800">{plan.expenseMaster.name}</td>
                        <td className="px-3 py-3 text-right font-semibold text-gray-900">{formatTHB(plan.principalAmount)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                            {plan.totalInstallments} งวด
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600 text-xs">
                          {plan.interestRate > 0
                            ? `${plan.interestRate}%/${plan.interestUnit === "year" ? "ปี" : "เดือน"}`
                            : "ไม่มีดอกเบี้ย"}
                        </td>
                        <td className="px-3 py-3 text-gray-600">{formatThaiDate(plan.startDate)}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${m.cls}`}>{m.text}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-400 text-xs max-w-[160px] truncate" title={plan.note ?? ""}>{plan.note ?? "—"}</td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => openEditPlan(plan)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                            <button onClick={() => deletePlan(plan.id, plan.expenseMaster.name)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${plan.id}-detail`} className="bg-gray-50 border-t border-gray-100">
                          <td colSpan={9} className="px-8 py-3">
                            <div className="text-xs text-gray-500 mb-2 font-medium">รายละเอียดงวด</div>
                            <table className="w-full max-w-xl text-xs">
                              <thead>
                                <tr className="text-gray-400">
                                  <th className="text-left py-1 pr-4">งวดที่</th>
                                  <th className="text-left py-1 pr-4">เดือน</th>
                                  <th className="text-right py-1">ยอดจ่าย</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {plan.items.map((item) => (
                                  <tr key={item.id}>
                                    <td className="py-1 pr-4 text-gray-600">{item.installmentNumber}</td>
                                    <td className="py-1 pr-4 text-gray-600">{formatThaiDate(item.startDate)}</td>
                                    <td className="py-1 text-right font-medium text-gray-800">{formatTHB(item.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ===== Regular Recurring Form Modal ===== */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold">{editing ? "แก้ไขรายการประจำ" : "เพิ่มรายการประจำ"}</h3>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs text-gray-500">Expense Type *</span>
                <select value={fMasterId} onChange={(e) => setFMasterId(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  {masters.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{m.defaultJarCode ? ` [${m.defaultJarCode}]` : ""}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">ยอด (บาท) *</span>
                <input type="number" value={fAmount} onChange={(e) => setFAmount(e.target.value)}
                  placeholder="5000"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <div>
                <span className="text-xs text-gray-500">ความถี่</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-600">ทุก</span>
                  <input type="number" min={1} value={fIntervalValue}
                    onChange={(e) => setFIntervalValue(e.target.value)}
                    className="w-16 border border-gray-300 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <select value={fIntervalUnit} onChange={(e) => setFIntervalUnit(e.target.value as "month" | "year")}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="month">เดือน</option>
                    <option value="year">ปี</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">วันที่เริ่ม</span>
                  <input type="date" value={fStart} onChange={(e) => setFStart(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <span className="text-[10px] text-gray-400">ว่าง = ย้อนหลังตลอด</span>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">วันที่สิ้นสุด</span>
                  <input type="date" value={fEnd} onChange={(e) => setFEnd(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <span className="text-[10px] text-gray-400">ว่าง = ไปข้างหน้าตลอด</span>
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500">หมายเหตุ</span>
                <textarea value={fNote} onChange={(e) => setFNote(e.target.value)}
                  rows={2} placeholder="หมายเหตุจะถูก seed ลงในรายการค่าใช้จ่ายของแต่ละเดือน"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">จ่ายโดย</span>
                <select value={fMethodId} onChange={(e) => setFMethodId(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">— ไม่ระบุ —</option>
                  {paymentMethods.map((pm) => (
                    <option key={pm.id} value={pm.id}>{pm.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={save} disabled={saving || !fMasterId || !fAmount}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Installment Plan Modal ===== */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl my-6">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">{editingPlanId ? "แก้ไขรายการผ่อน" : "สร้างรายการผ่อน"}</h3>
            </div>
            <div className="p-5 space-y-4">
              {editingPlanId && editingMaxSeeded > 0 && (
                <div className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                  งวดที่ 1–{editingMaxSeeded} ถูกดึงไปแล้ว จะไม่มีผลต่อยอดที่บันทึกไป
                </div>
              )}
              {/* Form inputs */}
              <div className="grid grid-cols-2 gap-4">
                <label className="block col-span-2">
                  <span className="text-xs text-gray-500">Expense Type *</span>
                  <div className="relative mt-1">
                    <input
                      type="text"
                      value={iPMasterName}
                      onChange={(e) => { setIPMasterName(e.target.value); setIPMasterId(""); setIPMasterCreateNew(false); setIPMasterOpen(true); }}
                      onFocus={() => { if (!masterLocked) setIPMasterOpen(true); }}
                      onBlur={() => setTimeout(() => setIPMasterOpen(false), 150)}
                      readOnly={masterLocked}
                      placeholder="พิมพ์หรือเลือกประเภทค่าใช้จ่าย"
                      className={`block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 ${masterLocked ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}`}
                    />
                    {masterLocked && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        เปลี่ยน Expense Type ไม่ได้ เพราะมีงวดที่ถูกดึงไปแล้ว
                      </p>
                    )}
                    {!masterLocked && iPMasterOpen && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {masters
                          .filter((m) => !iPMasterName || m.name.toLowerCase().includes(iPMasterName.toLowerCase()))
                          .map((m) => (
                            <button key={m.id} type="button"
                              onMouseDown={() => { setIPMasterId(String(m.id)); setIPMasterName(m.name); setIPMasterOpen(false); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 text-gray-700">
                              {m.name}{m.defaultJarCode ? ` [${m.defaultJarCode}]` : ""}
                            </button>
                          ))}
                      </div>
                    )}
                    {!masterLocked && iPMasterName.trim() && !masters.find((m) => m.name.toLowerCase() === iPMasterName.trim().toLowerCase()) && (
                      <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                        <input type="checkbox" checked={iPMasterCreateNew}
                          onChange={(e) => setIPMasterCreateNew(e.target.checked)}
                          className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-400" />
                        <span className="text-sm text-gray-600">
                          สร้าง Expense Type ใหม่: <span className="font-medium text-gray-800">&ldquo;{iPMasterName.trim()}&rdquo;</span>
                        </span>
                      </label>
                    )}
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">เงินต้น (บาท) *</span>
                  <input type="number" value={iPPrincipal} onChange={(e) => setIPPrincipal(e.target.value)}
                    placeholder="30000"
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">จำนวนงวด *</span>
                  <input type="number" min={1} value={iPInstallments} onChange={(e) => setIPInstallments(e.target.value)}
                    placeholder="10"
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">ดอกเบี้ย (%)</span>
                  <div className="flex gap-2 mt-1">
                    <input type="number" step="0.01" min={0} value={iPRate} onChange={(e) => setIPRate(e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                    <select value={iPRateUnit} onChange={(e) => setIPRateUnit(e.target.value as "month" | "year")}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                      <option value="month">ต่อเดือน</option>
                      <option value="year">ต่อปี</option>
                    </select>
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">วันที่งวดแรก *</span>
                  <input type="date" value={iPStartDate} onChange={(e) => setIPStartDate(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
                </label>
                <label className="block col-span-2">
                  <span className="text-xs text-gray-500">หมายเหตุ</span>
                  <textarea value={iPNote} onChange={(e) => setIPNote(e.target.value)}
                    rows={2} placeholder="หมายเหตุจะถูก seed ลงในรายการค่าใช้จ่ายของแต่ละเดือน"
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none" />
                </label>
                <label className="block col-span-2">
                  <span className="text-xs text-gray-500">วิธีจ่าย</span>
                  <select value={iPMethodId} onChange={(e) => setIPMethodId(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                    <option value="">— ไม่ระบุ —</option>
                    {paymentMethods.map((pm) => (
                      <option key={pm.id} value={pm.id}>{pm.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Preview table */}
              {previewRows.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">ตารางงวด (Preview)</span>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>รวมจ่าย: <strong className="text-gray-800">{formatTHB(totalPreview)}</strong></span>
                      <span>ดอกเบี้ยรวม: <strong className="text-orange-600">{formatTHB(totalInterest)}</strong></span>
                    </div>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-400 sticky top-0">
                        <tr>
                          <th className="text-center px-3 py-2">งวด</th>
                          <th className="text-left px-3 py-2">เดือน</th>
                          <th className="text-right px-3 py-2">ยอดจ่าย</th>
                          <th className="text-right px-3 py-2">เงินต้น</th>
                          <th className="text-right px-3 py-2">ดอกเบี้ย</th>
                          <th className="text-right px-3 py-2">คงเหลือ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {previewRows.map((row) => (
                          <tr key={row.num} className="hover:bg-gray-50">
                            <td className="text-center px-3 py-1.5 text-gray-500">{row.num}</td>
                            <td className="px-3 py-1.5 text-gray-600">
                              {MONTH_TH_SHORT[row.monthDate.getUTCMonth()]} {row.monthDate.getUTCFullYear() + 543}
                            </td>
                            <td className="px-3 py-1.5 text-right font-medium text-gray-800">{formatNum(row.amount)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-600">{formatNum(row.principal)}</td>
                            <td className="px-3 py-1.5 text-right text-orange-600">{formatNum(row.interest)}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">{formatNum(row.remaining)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={closePlanModal} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={savePlan}
                disabled={
                  savingPlan || !iPPrincipal || !iPInstallments || !iPStartDate ||
                  (!iPMasterId && !iPMasterName.trim()) ||
                  (!iPMasterId && !!iPMasterName.trim() && !masters.find((m) => m.name.toLowerCase() === iPMasterName.trim().toLowerCase()) && !iPMasterCreateNew)
                }
                className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {savingPlan ? "กำลังบันทึก..." : editingPlanId ? "บันทึกการแก้ไข" : "สร้างรายการผ่อน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
