"use client";

import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatTHB, formatNum, monthLabel } from "@/lib/utils";

interface BankAccount { id: number; name: string; color: string; accountNumber: string | null }

interface ExpenseMaster {
  id: number;
  name: string;
  defaultJarCode: string | null;
}

interface Jar {
  id: number; name: string; code: string; jarType: string;
  isNec: boolean; percentage: number; sortOrder: number;
  bankAccountId: number | null;
  bankAccount: BankAccount | null;
}

interface JarAllocation {
  jarId: number; amount: number; percentage: number | null;
  bankAccountId: number | null;
  bankAccount: BankAccount | null;
  jar: Jar & { bankAccount: BankAccount | null };
}

interface RecurringRef {
  installmentNumber: number | null;
  installmentPlan: { totalInstallments: number } | null;
}

interface PaymentMethod {
  id: number; name: string; code: string; sortOrder: number;
  bankAccountId: number | null;
}

interface Expense {
  id: number; name: string; jarCode: string; amount: number;
  isLocked: boolean;
  note: string | null; bankAccount: BankAccount | null;
  paymentMethod: { id: number; name: string } | null;
  recurringExpense: RecurringRef | null;
}

type DraftRow = { name: string; jarCode: string; amount: string; paymentMethodId: string; note: string };
const emptyRow = (): DraftRow => ({ name: "", jarCode: "NEC", amount: "", paymentMethodId: "", note: "" });

// Column order of the inline add-table (index used by fill/paste/Ctrl+D)
const COLS = ["name", "jarCode", "amount", "paymentMethodId", "note"] as const;
type ColKey = typeof COLS[number];

// Coerce a pasted cell string into the value our draft row expects for that column.
function coerceCell(key: ColKey, raw: string, jars: Jar[], paymentMethods: PaymentMethod[]): string {
  const v = raw.trim();
  if (key === "jarCode") {
    const j = jars.find((jj) => jj.code.toLowerCase() === v.toLowerCase());
    return j ? j.code : v.toUpperCase();
  }
  if (key === "paymentMethodId") {
    const pm = paymentMethods.find(
      (p) => p.name.toLowerCase() === v.toLowerCase() || String(p.id) === v,
    );
    return pm ? String(pm.id) : "";
  }
  return v;
}

interface SeedCandidate {
  id: number;
  name: string;
  jarCode: string;
  amount: number;
  paymentMethodId: number | null;
  paymentMethodName: string | null;
  note: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
}

interface DeductionItem {
  deductionTypeId: number;
  code: string;
  name: string;
  amount: number;
  isDefault: boolean;
}

interface IncomeItem {
  incomeTypeId: number;
  code: string;
  name: string;
  amount: number;
  excludeFromNet: boolean;
  isDefault: boolean;
}

interface PaymentSettlement {
  paymentMethodId: number;
  paidAt: string | null;
  reconciledAt: string | null;
}

interface BankTransfer {
  bankAccountId: number;
  transferredAt: string | null;
}

interface MonthlyRecord {
  id: number; year: number; month: number;
  necAmount: number; necIsManual: boolean;
  allocations: JarAllocation[];
  expenses: Expense[];
  deductionsList: DeductionItem[];
  incomeList: IncomeItem[];
  paymentSettlements: PaymentSettlement[];
  bankTransfers: BankTransfer[];
  unassignedBankAccountId: number | null;
}

export default function MonthDetailPage() {
  const params = useParams();
  const yearMonth = params.yearMonth as string;

  const [record, setRecord] = useState<MonthlyRecord | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [jars, setJars] = useState<Jar[]>([]);
  const [masters, setMasters] = useState<ExpenseMaster[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  // Income state
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [deductions, setDeductions] = useState<DeductionItem[]>([]);
  const [necAmount, setNecAmount] = useState(0);
  const [necIsManual, setNecIsManual] = useState(false);
  const [savingIncome, setSavingIncome] = useState(false);

  // Per-jar % overrides for this month: jarId -> %
  const [jarPcts, setJarPcts] = useState<Record<number, number>>({});
  // Per-jar bank account override for this month: jarId -> bankAccountId (key absent = use jar default)
  const [jarBankIds, setJarBankIds] = useState<Record<number, number>>({});
  const [savingJars, setSavingJars] = useState(false);
  const [jarTab, setJarTab] = useState<"allocate" | "transfer">("allocate");

  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expName, setExpName] = useState("");
  const [expJarCode, setExpJarCode] = useState("NEC");
  const [expAmount, setExpAmount] = useState("");
  const [expNote, setExpNote] = useState("");
  const [expPaymentMethodId, setExpPaymentMethodId] = useState<string>("");
  const [saveMaster, setSaveMaster] = useState(false);
  const [savingExp, setSavingExp] = useState(false);
  // Add mode: multiple draft rows edited inline
  const [draftRows, setDraftRows] = useState<DraftRow[]>([emptyRow()]);
  // Excel-like grid: active cell + drag-fill range
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [fill, setFill] = useState<{ col: number; startRow: number; endRow: number } | null>(null);
  const fillRef = useRef(fill);

  const [expenseView, setExpenseView] = useState<"grouped" | "flat">("grouped");
  const [groupBy, setGroupBy] = useState<"jar" | "paymentMethod">("jar");
  const [expandedJars, setExpandedJars] = useState<Set<string>>(new Set());
  const [expandedMasters, setExpandedMasters] = useState<Set<string>>(new Set());
  const [filterPmIds, setFilterPmIds] = useState<Set<number>>(new Set());
  const [showPmFilter, setShowPmFilter] = useState(false);

  // Manual seed of recurring items into this month
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seedCandidates, setSeedCandidates] = useState<SeedCandidate[]>([]);
  const [seedSelected, setSeedSelected] = useState<Set<number>>(new Set());
  const [seedLoading, setSeedLoading] = useState(false);
  const [seedSaving, setSeedSaving] = useState(false);

  function toggleJar(key: string) {
    setExpandedJars(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleMaster(key: string) {
    setExpandedMasters(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  interface MasterGroup { name: string; expenses: Expense[]; total: number; }
  interface Level1Group { key: string; label: string; sortOrder: number; masterGroups: MasterGroup[]; total: number; }

  const groupedExpenses = useMemo((): Level1Group[] => {
    if (!record) return [];
    const jarOrderMap = new Map(jars.map(j => [j.code, j.sortOrder]));

    const keyOf = (exp: Expense) =>
      groupBy === "jar" ? exp.jarCode : (exp.paymentMethod ? `pm:${exp.paymentMethod.id}` : "pm:none");

    const labelOf = (exp: Expense) =>
      groupBy === "jar" ? exp.jarCode : (exp.paymentMethod?.name ?? "ไม่ระบุ");

    const sortOrderOf = (exp: Expense) => {
      if (groupBy === "jar") return jarOrderMap.get(exp.jarCode) ?? 9999;
      if (!exp.paymentMethod) return 9999;
      const pm = paymentMethods.find(p => p.id === exp.paymentMethod!.id);
      return pm?.sortOrder ?? 9999;
    };

    const byL1 = new Map<string, { label: string; sortOrder: number; expenses: Expense[] }>();
    for (const exp of record.expenses) {
      const k = keyOf(exp);
      const b = byL1.get(k) ?? { label: labelOf(exp), sortOrder: sortOrderOf(exp), expenses: [] };
      b.expenses.push(exp);
      byL1.set(k, b);
    }

    const groups: Level1Group[] = [];
    for (const [key, { label, sortOrder, expenses }] of byL1) {
      const byName = new Map<string, Expense[]>();
      for (const exp of expenses) {
        const b = byName.get(exp.name) ?? [];
        b.push(exp);
        byName.set(exp.name, b);
      }
      const masterGroups = [...byName.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "th"))
        .map(([name, exps]) => ({ name, expenses: exps, total: exps.reduce((s, e) => s + e.amount, 0) }));
      groups.push({ key, label, sortOrder, masterGroups, total: expenses.reduce((s, e) => s + e.amount, 0) });
    }

    groups.sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.label.localeCompare(b.label, "th")
    );

    return groups;
  }, [record, jars, paymentMethods, groupBy]);

  const fetchData = useCallback(async () => {
    const [rec, accs, js, ms, pms] = await Promise.all([
      fetch(`/api/months/${yearMonth}`).then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/jars").then((r) => r.json()),
      fetch("/api/expense-master").then((r) => r.json()),
      fetch("/api/payment-methods").then((r) => r.json()),
    ]);
    setRecord(rec);
    setAccounts(accs);
    setJars(js);
    setMasters(ms);
    setPaymentMethods(pms);
    if (rec && !rec.error) {
      setIncomes(rec.incomeList ?? []);
      setDeductions(rec.deductionsList ?? []);
      setNecAmount(rec.necAmount);
      setNecIsManual(rec.necIsManual ?? false);
      // Init per-jar % from allocations (per-month) or jar default
      const pcts: Record<number, number> = {};
      const banks: Record<number, number> = {};
      for (const alloc of rec.allocations as JarAllocation[]) {
        if (!alloc.jar.isNec) {
          pcts[alloc.jarId] = alloc.percentage ?? alloc.jar.percentage;
          if (alloc.bankAccountId != null) banks[alloc.jarId] = alloc.bankAccountId;
        }
      }
      setJarPcts(pcts);
      setJarBankIds(banks);
    }
    setLoading(false);
  }, [yearMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const settlementMap = useMemo(() => {
    const m = new Map<number, PaymentSettlement>();
    for (const s of record?.paymentSettlements ?? []) m.set(s.paymentMethodId, s);
    return m;
  }, [record]);

  const lockedPaymentMethodIds = useMemo(
    () => new Set((record?.paymentSettlements ?? []).filter(s => s.reconciledAt).map(s => s.paymentMethodId)),
    [record],
  );

  // Flat ("รายการ") view: filtered by selected payment methods (empty set = show all).
  const flatExpenses = useMemo(() => {
    const all = record?.expenses ?? [];
    if (filterPmIds.size === 0) return all;
    return all.filter(e => e.paymentMethod && filterPmIds.has(e.paymentMethod.id));
  }, [record, filterPmIds]);

  function toggleFilterPm(id: number) {
    setFilterPmIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function updateSettlement(
    paymentMethodId: number,
    patch: { paidAt?: string | null; reconciledAt?: string | null },
  ) {
    const res = await fetch(`/api/months/${yearMonth}/settlements/${paymentMethodId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Update failed" }));
      alert(err.error || "บันทึกไม่สำเร็จ");
      return;
    }
    await fetchData();
  }

  const transferMap = useMemo(() => {
    const m = new Map<number, BankTransfer>();
    for (const t of record?.bankTransfers ?? []) m.set(t.bankAccountId, t);
    return m;
  }, [record]);

  const lockedBankIds = useMemo(
    () => new Set((record?.bankTransfers ?? []).filter(t => t.transferredAt).map(t => t.bankAccountId)),
    [record],
  );

  async function updateTransfer(
    bankAccountId: number,
    patch: { transferredAt: string | null },
  ) {
    const res = await fetch(`/api/months/${yearMonth}/transfers/${bankAccountId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Update failed" }));
      alert(err.error || "บันทึกไม่สำเร็จ");
      return;
    }
    await fetchData();
  }

  async function updateUnassignedBank(bankAccountId: number | null) {
    const res = await fetch(`/api/months/${yearMonth}/unassigned-bank`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankAccountId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Update failed" }));
      alert(err.error || "บันทึกไม่สำเร็จ");
      return;
    }
    await fetchData();
  }

  const grossIncome = incomes
    .filter((i) => !i.excludeFromNet)
    .reduce((s, i) => s + (i.amount || 0), 0);
  const taxWithheld = deductions.reduce((s, d) => s + (d.amount || 0), 0);
  const netIncome = grossIncome - taxWithheld;
  const remaining = netIncome - necAmount;

  function calcJarAmount(jar: Jar) {
    if (jar.isNec) return necAmount;
    return remaining * ((jarPcts[jar.id] ?? jar.percentage) / 100);
  }

  function getJarSpent(jarCode: string) {
    return (record?.expenses || [])
      .filter((e) => e.jarCode === jarCode)
      .reduce((s, e) => s + e.amount, 0);
  }

  const totalNonNecPct = jars
    .filter((j) => !j.isNec)
    .reduce((s, j) => s + (jarPcts[j.id] ?? j.percentage), 0);

  // Effective destination bank of a jar: per-month override ?? jar default
  function effectiveBankId(jar: Jar): number | null {
    return jarBankIds[jar.id] ?? jar.bankAccountId;
  }
  const lockedJarIds = new Set(
    jars.filter((j) => { const b = effectiveBankId(j); return b != null && lockedBankIds.has(b); }).map((j) => j.id),
  );

  interface BankSummaryPart { label: string; amount: number; kind: "jar" | "pm"; }
  interface BankSummaryRow {
    bankAccountId: number | null;
    bank: BankAccount | null;
    parts: BankSummaryPart[];
    total: number;
  }
  const unassignedBankId = record?.unassignedBankAccountId ?? null;
  const bankSummary: BankSummaryRow[] = (() => {
    const byBank = new Map<number | null, BankSummaryRow>();
    const rowFor = (bankId: number | null) => {
      let row = byBank.get(bankId);
      if (!row) {
        const bank = bankId != null ? (accounts.find((a) => a.id === bankId) ?? null) : null;
        row = { bankAccountId: bankId, bank, parts: [], total: 0 };
        byBank.set(bankId, row);
      }
      return row;
    };

    // (1) Jar remainder = allocated − spent (can be negative)
    for (const jar of jars) {
      const amount = calcJarAmount(jar) - getJarSpent(jar.code);
      const row = rowFor(effectiveBankId(jar) ?? unassignedBankId);
      row.parts.push({ label: jar.name, amount, kind: "jar" });
      row.total += amount;
    }

    // (2) Payment method totals → the bank you transfer to (to pay it off)
    for (const pm of paymentMethods) {
      const total = (record?.expenses ?? [])
        .filter((e) => e.paymentMethod?.id === pm.id)
        .reduce((s, e) => s + e.amount, 0);
      if (total === 0) continue;
      const row = rowFor(pm.bankAccountId ?? unassignedBankId);
      row.parts.push({ label: pm.name, amount: total, kind: "pm" });
      row.total += total;
    }

    // (3) Expenses with no payment method assigned → unassigned group (no bank)
    const knownPmIds = new Set(paymentMethods.map((p) => p.id));
    const noPmTotal = (record?.expenses ?? [])
      .filter((e) => !e.paymentMethod || !knownPmIds.has(e.paymentMethod.id))
      .reduce((s, e) => s + e.amount, 0);
    if (noPmTotal !== 0) {
      const row = rowFor(unassignedBankId);
      row.parts.push({ label: "ไม่ระบุวิธีจ่าย", amount: noPmTotal, kind: "pm" });
      row.total += noPmTotal;
    }

    // Banks first (by name), "no bank" group last
    return [...byBank.values()].sort((a, b) => {
      if (a.bankAccountId == null) return 1;
      if (b.bankAccountId == null) return -1;
      return (a.bank?.name ?? "").localeCompare(b.bank?.name ?? "", "th");
    });
  })();
  const totalTransfer = bankSummary.reduce((s, r) => s + r.total, 0);
  // Sum of all jar allocations incl NEC — must equal totalTransfer (invariant)
  const totalAllocated = jars.reduce((s, j) => s + calcJarAmount(j), 0);
  const necJarLocked = jars.some((j) => j.isNec && lockedJarIds.has(j.id));

  function buildPatchBody() {
    return {
      incomes: incomes.map((i) => ({ incomeTypeId: i.incomeTypeId, amount: i.amount })),
      deductions: deductions.map((d) => ({ deductionTypeId: d.deductionTypeId, amount: d.amount })),
      necAmount,
      necIsManual,
      jarPercentages: jarPcts,
      jarBankAccounts: jarBankIds,
    };
  }

  async function saveIncome() {
    setSavingIncome(true);
    await fetch(`/api/months/${yearMonth}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPatchBody()),
    });
    await fetchData();
    setSavingIncome(false);
  }

  async function saveJarPcts() {
    setSavingJars(true);
    await fetch(`/api/months/${yearMonth}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPatchBody()),
    });
    await fetchData();
    setSavingJars(false);
  }

  function resetJarPcts() {
    const defaults: Record<number, number> = {};
    for (const j of jars) {
      if (!j.isNec) defaults[j.id] = j.percentage;
    }
    setJarPcts(defaults);
  }

  function resetNec() {
    const necJar = jars.find((j) => j.isNec);
    if (necJar && necJar.percentage > 0) {
      setNecAmount(Math.round(netIncome * (necJar.percentage / 100)));
      setNecIsManual(false);
    }
  }

  function updateIncomeAmount(incomeTypeId: number, amount: number) {
    setIncomes((prev) =>
      prev.map((i) => i.incomeTypeId === incomeTypeId ? { ...i, amount, isDefault: false } : i)
    );
  }

  function openAddExpense() {
    setEditingExpense(null);
    setDraftRows([emptyRow()]);
    setActiveCell(null);
    setFill(null);
    setSaveMaster(false);
    setShowExpenseModal(true);
  }

  function addRow() {
    setDraftRows((prev) => [...prev, emptyRow()]);
  }

  function removeRow(i: number) {
    setDraftRows((prev) => (prev.length <= 1 ? [emptyRow()] : prev.filter((_, idx) => idx !== i)));
  }

  function updateRow(i: number, patch: Partial<DraftRow>) {
    setDraftRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== i) return row;
        const next = { ...row, ...patch };
        // Auto-fill jar from Master when name matches exactly
        if (patch.name !== undefined) {
          const m = masters.find((mm) => mm.name.toLowerCase() === patch.name!.trim().toLowerCase());
          if (m?.defaultJarCode) next.jarCode = m.defaultJarCode;
        }
        return next;
      }),
    );
  }

  // --- Excel-like grid helpers (add-table) ---
  useEffect(() => { fillRef.current = fill; }, [fill]);

  useEffect(() => {
    function onUp() {
      const f = fillRef.current;
      if (!f) return;
      applyFill(f);
      setFill(null);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFill(f: { col: number; startRow: number; endRow: number }) {
    const key = COLS[f.col];
    const lo = Math.min(f.startRow, f.endRow);
    const hi = Math.max(f.startRow, f.endRow);
    if (lo === hi) return;
    setDraftRows((prev) => {
      const src = prev[f.startRow]?.[key] ?? "";
      return prev.map((row, idx) => (idx >= lo && idx <= hi ? { ...row, [key]: src } : row));
    });
  }

  function handleCellKeyDown(e: React.KeyboardEvent, row: number, col: number) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (row <= 0) return;
      const key = COLS[col];
      setDraftRows((prev) =>
        prev.map((r, idx) => (idx === row ? { ...r, [key]: prev[row - 1][key] } : r)),
      );
    }
  }

  function handlePaste(e: React.ClipboardEvent, startRow: number, startCol: number) {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    const lines = text.replace(/\r/g, "").split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    const grid = lines.map((l) => l.split("\t"));
    if (grid.length === 1 && grid[0].length === 1) return; // single cell → default paste
    e.preventDefault();
    setDraftRows((prev) => {
      const next = prev.map((r) => ({ ...r }));
      grid.forEach((cells, r) => {
        const tr = startRow + r;
        while (next.length <= tr) next.push(emptyRow());
        cells.forEach((val, c) => {
          const tc = startCol + c;
          if (tc >= COLS.length) return;
          const key = COLS[tc];
          next[tr][key] = coerceCell(key, val, jars, paymentMethods);
        });
      });
      return next;
    });
  }

  async function toggleLock(exp: Expense) {
    const res = await fetch(`/api/expenses/${exp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isLocked: !exp.isLocked }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "ล็อกไม่สำเร็จ" }));
      alert(err.error || "ล็อกไม่สำเร็จ");
      return;
    }
    await fetchData();
  }

  function openEditExpense(exp: Expense) {
    if (exp.isLocked) {
      alert("รายการนี้ถูกล็อก ไม่สามารถแก้ไขได้");
      return;
    }
    if (exp.paymentMethod && lockedPaymentMethodIds.has(exp.paymentMethod.id)) {
      alert("รายการนี้อยู่ใน payment method ที่ตรวจสอบแล้ว ไม่สามารถแก้ไขได้");
      return;
    }
    setEditingExpense(exp); setExpName(exp.name); setExpJarCode(exp.jarCode);
    setExpAmount(String(exp.amount));
    setExpNote(exp.note || "");
    setExpPaymentMethodId(exp.paymentMethod ? String(exp.paymentMethod.id) : "");
    setSaveMaster(false);
    setShowExpenseModal(true);
  }

  async function saveExpense() {
    if (editingExpense) {
      await saveEditExpense();
      return;
    }
    await saveNewExpenses();
  }

  async function saveEditExpense() {
    if (!editingExpense || !expName || !expAmount) return;
    setSavingExp(true);
    const res = await fetch(`/api/expenses/${editingExpense.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: expName, jarCode: expJarCode, amount: expAmount,
        bankAccountId: null, note: expNote,
        paymentMethodId: expPaymentMethodId ? parseInt(expPaymentMethodId) : null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Save failed" }));
      alert(err.error || "บันทึกไม่สำเร็จ");
      setSavingExp(false);
      return;
    }
    setShowExpenseModal(false);
    await fetchData();
    setSavingExp(false);
  }

  async function saveNewExpenses() {
    const rows = draftRows.filter((r) => r.name.trim() && r.amount);
    if (rows.length === 0) return;
    setSavingExp(true);
    const res = await fetch(`/api/months/${yearMonth}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: rows.map((r) => ({
          name: r.name.trim(),
          jarCode: r.jarCode,
          amount: r.amount,
          bankAccountId: null,
          note: r.note || null,
          paymentMethodId: r.paymentMethodId ? parseInt(r.paymentMethodId) : null,
        })),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Save failed" }));
      alert(err.error || "บันทึกไม่สำเร็จ");
      setSavingExp(false);
      return;
    }
    if (saveMaster) {
      const seen = new Set<string>();
      for (const r of rows) {
        const key = r.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const alreadyExists = masters.some((m) => m.name.toLowerCase() === key);
        if (!alreadyExists) {
          await fetch("/api/expense-master", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: r.name.trim(), defaultJarCode: r.jarCode || null }),
          });
        }
      }
    }
    setShowExpenseModal(false);
    await fetchData();
    setSavingExp(false);
  }

  async function openSeedModal() {
    setShowSeedModal(true);
    setSeedLoading(true);
    try {
      const res = await fetch(`/api/months/${yearMonth}/seed-recurring`);
      const data: SeedCandidate[] = await res.json();
      const list = Array.isArray(data) ? data : [];
      setSeedCandidates(list);
      setSeedSelected(new Set(list.map((c) => c.id)));
    } catch {
      setSeedCandidates([]);
      setSeedSelected(new Set());
    }
    setSeedLoading(false);
  }

  function toggleSeed(id: number) {
    setSeedSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSeedAll() {
    setSeedSelected((prev) =>
      prev.size === seedCandidates.length ? new Set() : new Set(seedCandidates.map((c) => c.id)),
    );
  }

  async function saveSeed() {
    if (seedSelected.size === 0) return;
    setSeedSaving(true);
    const res = await fetch(`/api/months/${yearMonth}/seed-recurring`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...seedSelected] }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Seed failed" }));
      alert(err.error || "เพิ่มไม่สำเร็จ");
      setSeedSaving(false);
      return;
    }
    const result = await res.json().catch(() => ({ skippedLocked: 0 }));
    if (result.skippedLocked > 0) {
      alert(`ข้าม ${result.skippedLocked} รายการที่อยู่ใน payment method ที่ตรวจสอบแล้ว (ล็อก)`);
    }
    setShowSeedModal(false);
    await fetchData();
    setSeedSaving(false);
  }

  async function deleteExpense(id: number) {
    const exp = record?.expenses.find(e => e.id === id);
    if (exp?.paymentMethod && lockedPaymentMethodIds.has(exp.paymentMethod.id)) {
      alert("รายการนี้อยู่ใน payment method ที่ตรวจสอบแล้ว ไม่สามารถลบได้");
      return;
    }
    if (!confirm("ลบรายการนี้?")) return;
    const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Delete failed" }));
      alert(err.error || "ลบไม่สำเร็จ");
      return;
    }
    await fetchData();
  }

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;
  if (!record || (record as { error?: string }).error) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500 mb-4">ไม่พบข้อมูลเดือนนี้</p>
        <Link href="/" className="text-indigo-600 hover:underline">กลับหน้าหลัก</Link>
      </div>
    );
  }

  const [yearStr, monthStr] = yearMonth.split("-");
  const title = monthLabel(parseInt(yearStr), parseInt(monthStr));

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/" className="text-gray-400 hover:text-indigo-600">หน้าหลัก</Link>
        <span className="text-gray-300">/</span>
        <span className="text-gray-700 font-medium">{title}</span>
      </div>

      {/* === SECTION 1: INCOME === */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">💵 รายรับ</h2>
          <button onClick={saveIncome} disabled={savingIncome}
            className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 disabled:opacity-50">
            {savingIncome ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
        <div className="p-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 border-b border-gray-200">
                <th className="text-left py-2 px-2 w-1/2">รายการ</th>
                <th className="text-right py-2 px-2">จำนวน (บาท)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {/* รับ */}
              <tr className="bg-green-50/50">
                <td colSpan={2} className="px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">รับ</span>
                    <a href="/deductions/manage" className="text-xs text-gray-400 hover:text-indigo-600 underline">จัดการประเภท</a>
                  </div>
                </td>
              </tr>
              {incomes.map((item) => (
                <tr key={item.incomeTypeId}>
                  <td className="px-2 py-2 text-gray-700">
                    {item.name}
                    {item.isDefault && (
                      <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">default</span>
                    )}
                    {item.excludeFromNet && (
                      <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">ไม่รวมสุทธิ</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      value={item.amount}
                      onChange={(e) => updateIncomeAmount(item.incomeTypeId, parseFloat(e.target.value) || 0)}
                      className={`w-32 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 ${
                        item.excludeFromNet
                          ? "border-orange-200 bg-orange-50 focus:ring-orange-300"
                          : "border-gray-300 focus:ring-indigo-400"
                      }`}
                    />
                  </td>
                </tr>
              ))}
              <tr className="bg-green-50 font-medium">
                <td className="px-2 py-2 text-gray-700">รวมรับ (Gross)</td>
                <td className="px-2 py-2 text-right text-gray-900">{formatTHB(grossIncome)}</td>
              </tr>

              {/* หัก */}
              <tr className="bg-red-50/50">
                <td colSpan={2} className="px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">หัก</span>
                    <a href="/deductions/manage" className="text-xs text-gray-400 hover:text-indigo-600 underline">จัดการประเภท / Default</a>
                  </div>
                </td>
              </tr>
              {deductions.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-2 py-3 text-center text-xs text-gray-400">
                    ยังไม่มีรายการหัก — เพิ่มได้ที่หน้า{" "}
                    <a href="/deductions/manage" className="text-indigo-600 hover:underline">จัดการรายการหัก</a>
                  </td>
                </tr>
              ) : (
                deductions.map((d, idx) => (
                  <tr key={d.deductionTypeId}>
                    <td className="px-2 py-2 text-gray-700">
                      {d.name}
                      {d.isDefault && (
                        <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">default</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input type="number" value={d.amount}
                        onChange={(e) => {
                          const next = [...deductions];
                          next[idx] = { ...d, amount: parseFloat(e.target.value) || 0, isDefault: false };
                          setDeductions(next);
                        }}
                        className="w-32 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-red-300" />
                    </td>
                  </tr>
                ))
              )}
              <tr className="bg-red-50 font-medium">
                <td className="px-2 py-2 text-gray-700">รวมหัก</td>
                <td className="px-2 py-2 text-right text-red-500">-{formatTHB(taxWithheld)}</td>
              </tr>

              {/* Net */}
              <tr className="bg-indigo-50 font-bold">
                <td className="px-2 py-3 text-indigo-700">รายรับสุทธิ (Net)</td>
                <td className="px-2 py-3 text-right text-indigo-700 text-base">{formatTHB(netIncome)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* === SECTION 2: JAR ALLOCATION === */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">🫙 การจัดสรรเงิน (Jar Allocation)</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setJarTab("allocate")}
                className={`px-2.5 py-1.5 ${jarTab === "allocate" ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >จัดสรร</button>
              <button
                onClick={() => setJarTab("transfer")}
                className={`px-2.5 py-1.5 border-l border-gray-200 ${jarTab === "transfer" ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >สรุปโอนธนาคาร</button>
            </div>
            {jarTab === "allocate" && (
              <>
                <button onClick={resetJarPcts}
                  className="text-xs text-gray-500 hover:text-gray-700 underline">
                  Reset % เป็น default
                </button>
                <button onClick={saveJarPcts} disabled={savingJars}
                  className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md hover:bg-indigo-700 disabled:opacity-50">
                  {savingJars ? "กำลังบันทึก..." : "บันทึก Jar"}
                </button>
              </>
            )}
          </div>
        </div>
        {jarTab === "allocate" && (
        <>
        {/* NEC row + warning */}
        <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-amber-800">NEC (ค่าใช้จ่ายประจำ)</label>
          <input type="number" value={necAmount} disabled={necJarLocked}
            onChange={(e) => { setNecAmount(parseFloat(e.target.value) || 0); setNecIsManual(true); }}
            onBlur={saveJarPcts}
            className="w-32 border border-amber-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white disabled:bg-gray-100 disabled:text-gray-400" />
          {necIsManual && (
            <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">กำหนดเอง</span>
          )}
          {necJarLocked ? (
            <span className="text-xs text-gray-400" title="ธนาคารถูกโอนแล้ว — ล็อก">🔒 โอนแล้ว</span>
          ) : (
            <button onClick={resetNec} className="text-xs text-amber-600 hover:text-amber-800 underline">Reset %</button>
          )}
          <div className="ml-auto flex items-center gap-4 text-xs text-amber-700">
            <span>ใช้ไป: <strong className="text-red-600">{formatTHB(getJarSpent("NEC"))}</strong></span>
            <span>คงเหลือ: <strong className={necAmount - getJarSpent("NEC") < 0 ? "text-red-600" : "text-green-700"}>{formatTHB(necAmount - getJarSpent("NEC"))}</strong></span>
            <span>เหลือแจกจ่าย: <strong>{formatTHB(remaining)}</strong></span>
          </div>
        </div>
        {totalNonNecPct !== 100 && (
          <div className={`px-5 py-2 text-xs border-b ${totalNonNecPct > 100 ? "bg-red-50 text-red-600 border-red-100" : "bg-yellow-50 text-yellow-700 border-yellow-100"}`}>
            % รวม (ไม่รวม NEC): <strong>{totalNonNecPct.toFixed(1)}%</strong>
            {totalNonNecPct > 100 ? " ⚠ เกิน 100%" : ` — ยังขาด ${(100 - totalNonNecPct).toFixed(1)}%`}
          </div>
        )}

        {/* Jar table */}
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium">Jar</th>
              <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell w-44">ธนาคาร</th>
              <th className="text-left px-3 py-2.5 font-medium w-44">% ของ remaining</th>
              <th className="text-right px-3 py-2.5 font-medium">จัดสรร</th>
              <th className="text-right px-3 py-2.5 font-medium hidden md:table-cell">ใช้ไป</th>
              <th className="text-right px-3 py-2.5 font-medium hidden md:table-cell">คงเหลือ</th>
              <th className="px-3 py-2.5 w-32 hidden md:table-cell"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {jars.filter((j) => !j.isNec).map((jar) => {
              const pct = jarPcts[jar.id] ?? jar.percentage;
              const allocated = remaining * (pct / 100);
              const spent = getJarSpent(jar.code);
              const jarRemaining = allocated - spent;
              const usedPct = allocated > 0 ? Math.min(100, (spent / allocated) * 100) : 0;
              const isDefaultPct = pct === jar.percentage;
              const locked = lockedJarIds.has(jar.id);

              return (
                <tr key={jar.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800">{jar.name}</span>
                      {locked && (
                        <span className="text-xs text-gray-400" title="ธนาคารถูกโอนแล้ว — ล็อก">🔒</span>
                      )}
                      {!isDefaultPct && (
                        <span className="text-xs text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">แก้ไขแล้ว</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{jar.code}</span>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell">
                    {(() => {
                      const overrideId = jarBankIds[jar.id];
                      const hasOverride = overrideId !== undefined;
                      const isDifferent = hasOverride && overrideId !== jar.bankAccountId;
                      const effective = hasOverride
                        ? (accounts.find((a) => a.id === overrideId) ?? null)
                        : jar.bankAccount;
                      return (
                        <div className="flex items-center gap-1.5">
                          {effective && (
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: effective.color }} />
                          )}
                          <select
                            value={hasOverride ? String(overrideId) : ""}
                            disabled={locked || pct <= 0}
                            title={pct <= 0 ? "จัดสรร 0% — ไม่ต้องเลือกธนาคาร" : ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setJarBankIds((prev) => {
                                const next = { ...prev };
                                if (v === "") delete next[jar.id];
                                else next[jar.id] = parseInt(v);
                                return next;
                              });
                            }}
                            className="w-32 flex-shrink-0 border border-gray-300 rounded px-1.5 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <option value="">— default ({jar.bankAccount?.name ?? "ไม่ระบุ"}) —</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                          {isDifferent && (
                            <span className="text-[10px] text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded">แก้ไขแล้ว</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-3 text-left">
                    <div className="flex items-center gap-1 justify-start">
                      <input
                        type="number"
                        value={pct}
                        min={0} max={100} step={0.1}
                        disabled={locked}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 0;
                          setJarPcts((prev) => ({ ...prev, [jar.id]: v }));
                        }}
                        className="w-10 flex-shrink-0 border border-gray-300 rounded px-1 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:bg-gray-100 disabled:text-gray-400"
                      />
                      <span className="text-xs text-gray-400">%</span>
                      {!isDefaultPct && !locked && (
                        <button
                          onClick={() => setJarPcts((prev) => ({ ...prev, [jar.id]: jar.percentage }))}
                          className="text-gray-400 hover:text-gray-600 text-sm leading-none"
                          title="Reset"
                        >↺</button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-gray-900">
                    {formatTHB(allocated)}
                  </td>
                  <td className="px-3 py-3 text-right text-red-500 hidden md:table-cell">
                    {formatTHB(spent)}
                  </td>
                  <td className={`px-3 py-3 text-right font-medium hidden md:table-cell ${jarRemaining < 0 ? "text-red-600" : "text-green-700"}`}>
                    {formatTHB(jarRemaining)}
                  </td>
                  <td className="px-3 py-3 hidden md:table-cell">
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${usedPct > 90 ? "bg-red-400" : "bg-indigo-400"}`}
                        style={{ width: `${usedPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 text-right">{usedPct.toFixed(0)}%</p>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 py-3 bg-indigo-50 border-t border-indigo-100 flex items-center justify-between text-sm">
          <span className="font-medium text-indigo-800">รวมจัดสรรทั้งหมด (รวม NEC)</span>
          <span className="font-bold text-indigo-700">{formatTHB(totalAllocated)}</span>
        </div>
        </>
        )}

        {jarTab === "transfer" && (
          <>
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-500">รายการที่ไม่ระบุธนาคาร (เงินสด / ไม่ระบุวิธีจ่าย / jar ไม่มีธนาคาร) โอนรวมเข้า:</span>
            <select
              value={unassignedBankId != null ? String(unassignedBankId) : ""}
              onChange={(e) => updateUnassignedBank(e.target.value ? parseInt(e.target.value) : null)}
              className="border border-gray-300 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              <option value="">— ไม่ระบุ —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">ธนาคารปลายทาง</th>
                <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">รายการที่ต้องโอน</th>
                <th className="text-right px-3 py-2.5 font-medium">ยอดที่ต้องโอน</th>
                <th className="text-left px-3 py-2.5 font-medium w-64">โอนแล้ว</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {bankSummary.map((row) => {
                const transfer = row.bankAccountId != null ? transferMap.get(row.bankAccountId) : undefined;
                const transferred = !!transfer?.transferredAt;
                return (
                  <tr key={row.bankAccountId ?? "none"} className={transferred ? "bg-green-50/40" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.bank ? (
                          <>
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: row.bank.color }} />
                            <div>
                              <div className="font-medium text-gray-800">{row.bank.name}</div>
                              {row.bank.accountNumber && (
                                <div className="text-xs text-gray-400 font-mono">{row.bank.accountNumber}</div>
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="font-medium text-gray-400">ไม่ระบุธนาคาร</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs hidden sm:table-cell">
                      <div className="space-y-0.5">
                        {row.parts.map((p, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span title={p.kind === "jar" ? "Jar (คงเหลือ)" : "วิธีจ่าย"}>{p.kind === "jar" ? "🫙" : "💳"}</span>
                            <span className="text-gray-600">{p.label}</span>
                            <span className={`ml-auto tabular-nums ${p.amount < 0 ? "text-red-500" : "text-gray-400"}`}>{formatTHB(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className={`px-3 py-3 text-right font-semibold ${row.total < 0 ? "text-red-600" : "text-gray-900"}`}>
                      {formatTHB(row.total)}
                    </td>
                    <td className="px-3 py-3">
                      {row.bankAccountId == null || (row.total < 1 && !transferred) ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={transferred}
                              onChange={(e) => updateTransfer(row.bankAccountId!, {
                                transferredAt: e.target.checked ? new Date().toISOString().slice(0, 10) : null,
                              })}
                              className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-400 cursor-pointer"
                            />
                            <span className="text-gray-600">โอนแล้ว</span>
                          </label>
                          {transferred && transfer?.transferredAt && (
                            <input type="date" value={transfer.transferredAt.slice(0, 10)}
                              onChange={(e) => updateTransfer(row.bankAccountId!, { transferredAt: e.target.value || null })}
                              className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white" />
                          )}
                          {transferred && <span className="text-gray-400 text-sm" title="ล็อก">🔒</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 text-sm font-semibold">
              <tr>
                <td className="px-4 py-3 text-gray-700" colSpan={2}>รวมต้องโอนทั้งหมด</td>
                <td className="px-3 py-3 text-right text-indigo-700">{formatTHB(totalTransfer)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
          </>
        )}
      </div>

      {/* === SECTION 3: EXPENSES === */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">🧾 รายจ่าย</h2>
          <div className="flex items-center gap-2">
            {expenseView === "flat" && (
              <div className="relative">
                <button
                  onClick={() => setShowPmFilter(v => !v)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border ${filterPmIds.size > 0 ? "border-purple-300 bg-purple-50 text-purple-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
                >
                  <span>วิธีจ่าย</span>
                  {filterPmIds.size > 0 && (
                    <span className="bg-purple-600 text-white rounded-full px-1.5 py-0.5 text-[10px] leading-none">{filterPmIds.size}</span>
                  )}
                  <span className={`text-[9px] transition-transform ${showPmFilter ? "rotate-180" : ""}`}>▼</span>
                </button>
                {showPmFilter && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPmFilter(false)} />
                    <div className="absolute right-0 mt-1 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
                      <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-gray-100">
                        <span className="text-xs font-medium text-gray-600">กรองวิธีจ่าย</span>
                        {filterPmIds.size > 0 && (
                          <button onClick={() => setFilterPmIds(new Set())}
                            className="text-[11px] text-gray-400 hover:text-red-500">ล้าง</button>
                        )}
                      </div>
                      <div className="max-h-56 overflow-y-auto">
                        {paymentMethods.length === 0 ? (
                          <div className="px-1 py-2 text-xs text-gray-400">ยังไม่มีวิธีจ่าย</div>
                        ) : paymentMethods.map((pm) => (
                          <label key={pm.id} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={filterPmIds.has(pm.id)}
                              onChange={() => toggleFilterPm(pm.id)}
                              className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-400"
                            />
                            <span>{pm.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {expenseView === "grouped" && (
              <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
                <button
                  onClick={() => setGroupBy("jar")}
                  className={`px-2.5 py-1.5 ${groupBy === "jar" ? "bg-purple-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                >Jar</button>
                <button
                  onClick={() => setGroupBy("paymentMethod")}
                  className={`px-2.5 py-1.5 border-l border-gray-200 ${groupBy === "paymentMethod" ? "bg-purple-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
                >วิธีจ่าย</button>
              </div>
            )}
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              <button
                onClick={() => setExpenseView("grouped")}
                className={`px-2.5 py-1.5 ${expenseView === "grouped" ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >จัดกลุ่ม</button>
              <button
                onClick={() => setExpenseView("flat")}
                className={`px-2.5 py-1.5 border-l border-gray-200 ${expenseView === "flat" ? "bg-indigo-600 text-white" : "bg-white text-gray-500 hover:bg-gray-50"}`}
              >รายการ</button>
            </div>
            <button onClick={openSeedModal}
              className="text-xs bg-white text-indigo-600 border border-indigo-300 px-3 py-1.5 rounded-md hover:bg-indigo-50">
              ⟳ Seed รายการประจำ
            </button>
            <button onClick={openAddExpense}
              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700">
              + เพิ่มรายจ่าย
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {record.expenses.length === 0 ? (
            <div className="py-10 text-center text-gray-400 text-sm">ยังไม่มีรายจ่าย</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="text-left px-4 py-3">รายการ</th>
                  <th className="text-left px-3 py-3">Jar</th>
                  <th className="text-left px-3 py-3">วิธีจ่าย</th>
                  <th className="text-right px-3 py-3">จำนวน</th>
                  <th className="text-left px-3 py-3">หมายเหตุ</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {expenseView === "flat" ? (
                  flatExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-gray-400 text-sm">ไม่พบรายการตามตัวกรอง</td>
                    </tr>
                  ) : flatExpenses.map((exp) => {
                    const settlementLocked = !!(exp.paymentMethod && lockedPaymentMethodIds.has(exp.paymentMethod.id));
                    return (
                    <tr key={exp.id} className="hover:bg-gray-50 border-t border-gray-100">
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {exp.name}
                        {exp.recurringExpense?.installmentNumber != null && (
                          <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                            งวด {exp.recurringExpense.installmentNumber}/{exp.recurringExpense.installmentPlan?.totalInstallments}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium">{exp.jarCode}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600">
                        {exp.paymentMethod?.name ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-800 font-medium">{formatNum(exp.amount)}</td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">{exp.note || ""}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-2 justify-end items-center">
                          {settlementLocked ? (
                            <span className="text-gray-300 text-sm" title="ถูกตรวจสอบแล้ว — ล็อก">🔒</span>
                          ) : (
                            <>
                              {!exp.isLocked && (
                                <>
                                  <button onClick={() => openEditExpense(exp)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                                  <button onClick={() => deleteExpense(exp.id)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                                </>
                              )}
                              <label className="flex items-center gap-1 cursor-pointer ml-1" title="ล็อกรายการนี้ไม่ให้แก้ไข">
                                <input
                                  type="checkbox"
                                  checked={exp.isLocked}
                                  onChange={() => toggleLock(exp)}
                                  className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-400 cursor-pointer"
                                />
                                <span className="text-xs text-gray-400">{exp.isLocked ? "🔒" : "ล็อก"}</span>
                              </label>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })
                ) : (
                  groupedExpenses.map((l1Group) => {
                    const isCollapsed = !expandedJars.has(l1Group.key);
                    const badgeCls = groupBy === "jar"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-purple-100 text-purple-700";
                    const showFlags = groupBy === "paymentMethod" && l1Group.key !== "pm:none";
                    const pmId = showFlags ? parseInt(l1Group.key.replace("pm:", "")) : null;
                    const settle = pmId != null ? settlementMap.get(pmId) : undefined;
                    return (
                      <Fragment key={l1Group.key}>
                        {/* Level 1: Group header */}
                        <tr className="bg-indigo-50 cursor-pointer select-none hover:bg-indigo-100"
                            onClick={() => toggleJar(l1Group.key)}>
                          <td className="px-4 py-2" colSpan={6}>
                            <div className="flex items-center gap-2">
                              <span className={`text-indigo-400 text-xs transition-transform ${isCollapsed ? "" : "rotate-90"}`}>▶</span>
                              <span className={`${badgeCls} px-2 py-0.5 rounded text-xs font-medium`}>{l1Group.label}</span>
                              <span className="ml-auto text-sm font-semibold text-gray-700">{formatNum(l1Group.total)}</span>
                              {showFlags && pmId != null && (
                                <div className="flex items-center gap-3 ml-3" onClick={(e) => e.stopPropagation()}>
                                  <label className="flex items-center gap-1.5 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={!!settle?.reconciledAt}
                                      disabled={!!settle?.paidAt}
                                      title={settle?.paidAt ? "ยกเลิกจ่ายก่อนถึงจะยกเลิกตรวจสอบได้" : ""}
                                      onChange={(e) => updateSettlement(pmId, {
                                        reconciledAt: e.target.checked ? new Date().toISOString().slice(0, 10) : null,
                                      })}
                                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    <span className="text-gray-600">ตรวจสอบแล้ว</span>
                                    {settle?.reconciledAt && (
                                      <input type="date" value={settle.reconciledAt.slice(0, 10)}
                                        onChange={(e) => updateSettlement(pmId, { reconciledAt: e.target.value || null })}
                                        className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white" />
                                    )}
                                  </label>
                                  <label className="flex items-center gap-1.5 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={!!settle?.paidAt}
                                      disabled={!settle?.reconciledAt}
                                      title={!settle?.reconciledAt ? "ต้องตรวจสอบก่อน" : ""}
                                      onChange={(e) => updateSettlement(pmId, {
                                        paidAt: e.target.checked ? new Date().toISOString().slice(0, 10) : null,
                                      })}
                                      className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-400 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                    <span className="text-gray-600">จ่ายแล้ว</span>
                                    {settle?.paidAt && (
                                      <input type="date" value={settle.paidAt.slice(0, 10)}
                                        onChange={(e) => updateSettlement(pmId, { paidAt: e.target.value || null })}
                                        className="border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white" />
                                    )}
                                  </label>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>

                        {!isCollapsed && l1Group.masterGroups.map((masterGroup) => {
                          const masterKey = `${l1Group.key}:${masterGroup.name}`;
                          const isMasterCollapsed = !expandedMasters.has(masterKey);
                          return (
                            <Fragment key={masterKey}>
                              {/* Level 2: Master name sub-header */}
                              <tr className="bg-gray-50 cursor-pointer select-none hover:bg-gray-100"
                                  onClick={() => toggleMaster(masterKey)}>
                                <td className="pl-8 pr-4 py-1.5" colSpan={6}>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-gray-400 text-xs transition-transform ${isMasterCollapsed ? "" : "rotate-90"}`}>▶</span>
                                    <span className="text-sm font-medium text-gray-700">{masterGroup.name}</span>
                                    <span className="ml-auto text-sm font-medium text-gray-600">{formatNum(masterGroup.total)}</span>
                                  </div>
                                </td>
                              </tr>

                              {/* Individual expense rows */}
                              {!isMasterCollapsed && masterGroup.expenses.map((exp) => (
                                <tr key={exp.id} className="hover:bg-gray-50 border-t border-gray-100">
                                  <td className="pl-12 pr-4 py-2.5 font-medium text-gray-800">
                                    {exp.name}
                                    {exp.recurringExpense?.installmentNumber != null && (
                                      <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                                        งวด {exp.recurringExpense.installmentNumber}/{exp.recurringExpense.installmentPlan?.totalInstallments}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs font-medium">{exp.jarCode}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-xs text-gray-600">
                                    {exp.paymentMethod?.name ?? <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-gray-800 font-medium">{formatNum(exp.amount)}</td>
                                  <td className="px-3 py-2.5 text-gray-400 text-xs">{exp.note || ""}</td>
                                  <td className="px-3 py-2.5">
                                    <div className="flex gap-2 justify-end items-center">
                                      {exp.isLocked || (exp.paymentMethod && lockedPaymentMethodIds.has(exp.paymentMethod.id)) ? (
                                        <span className="text-gray-300 text-sm" title={exp.isLocked ? "ล็อกไว้" : "ถูกตรวจสอบแล้ว — ล็อก"}>🔒</span>
                                      ) : (
                                        <>
                                          <button onClick={() => openEditExpense(exp)} className="text-gray-400 hover:text-indigo-600 text-xs">แก้ไข</button>
                                          <button onClick={() => deleteExpense(exp.id)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-gray-50 text-sm font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-700" colSpan={3}>รวมทั้งหมด</td>
                  <td className="px-3 py-3 text-right text-red-600">
                    {formatNum(record.expenses.reduce((s, e) => s + e.amount, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* Manual Seed Modal */}
      {showSeedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Seed รายการประจำเข้าเดือนนี้</h3>
              <p className="text-xs text-gray-400 mt-0.5">รายการประจำที่ยังไม่ถูกเพิ่มในเดือนนี้</p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {seedLoading ? (
                <div className="py-10 text-center text-gray-400 text-sm">กำลังโหลด...</div>
              ) : seedCandidates.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">
                  ไม่มีรายการประจำใหม่ที่ยังไม่ถูกเพิ่ม
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2 px-5 py-2.5 border-b border-gray-100 bg-gray-50 cursor-pointer sticky top-0">
                    <input
                      type="checkbox"
                      checked={seedSelected.size === seedCandidates.length}
                      onChange={toggleSeedAll}
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                    />
                    <span className="text-xs font-medium text-gray-600">
                      เลือกทั้งหมด ({seedSelected.size}/{seedCandidates.length})
                    </span>
                  </label>
                  {seedCandidates.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={seedSelected.has(c.id)}
                        onChange={() => toggleSeed(c.id)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">{c.name}</span>
                          {c.installmentNumber != null && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                              งวด {c.installmentNumber}/{c.totalInstallments}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                          <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">{c.jarCode}</span>
                          {c.paymentMethodName && <span>{c.paymentMethodName}</span>}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-800 tabular-nums">{formatNum(c.amount)}</span>
                    </label>
                  ))}
                </>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowSeedModal(false)}
                className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={saveSeed} disabled={seedSaving || seedSelected.size === 0}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {seedSaving ? "กำลังเพิ่ม..." : `เพิ่ม ${seedSelected.size} รายการ`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && editingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-2xl">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">แก้ไขรายจ่าย</h3>
            </div>
            <div className="p-5 space-y-3">
              {/* Name combobox */}
              <label className="block">
                <span className="text-xs text-gray-500">ชื่อรายการ *</span>
                <div className="mt-1 relative">
                  <input
                    type="text"
                    list="expense-master-names-edit"
                    value={expName}
                    onChange={(e) => setExpName(e.target.value)}
                    placeholder="เลือกหรือพิมพ์ชื่อรายการ"
                    className="block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <datalist id="expense-master-names-edit">
                    {masters.map((m) => (
                      <option key={m.id} value={m.name} />
                    ))}
                  </datalist>
                </div>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">Jar</span>
                  <select value={expJarCode} onChange={(e) => setExpJarCode(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    {jars.map((j) => (
                      <option key={j.code} value={j.code}>{j.code} — {j.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">จำนวนเงิน (บาท) *</span>
                  <input type="number" value={expAmount} onChange={(e) => setExpAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                </label>
              </div>
              <label className="block">
                <span className="text-xs text-gray-500">วิธีจ่าย</span>
                <select value={expPaymentMethodId} onChange={(e) => setExpPaymentMethodId(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">— ไม่ระบุ —</option>
                  {paymentMethods.map((pm) => {
                    const locked = lockedPaymentMethodIds.has(pm.id);
                    const isCurrent = expPaymentMethodId === String(pm.id);
                    return (
                      <option key={pm.id} value={pm.id} disabled={locked && !isCurrent}>
                        {pm.name}{locked ? " (ตรวจสอบแล้ว — ล็อก)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">หมายเหตุ</span>
                <input type="text" value={expNote} onChange={(e) => setExpNote(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button onClick={() => setShowExpenseModal(false)}
                className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={saveExpense} disabled={savingExp || !expName || !expAmount}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {savingExp ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showExpenseModal && !editingExpense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">เพิ่มรายจ่าย (หลายรายการ)</h3>
            </div>

            <datalist id="expense-master-names">
              {masters.map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>

            <div className="p-5 overflow-auto">
              <p className="text-xs text-gray-400 mb-2">
                💡 วางจาก Excel ได้ (Ctrl+V) · ลากจุดมุมขวาล่างเพื่อคัดลอกลง · Ctrl+D คัดลอกจากแถวบน
              </p>
              <table className={`w-full text-sm ${fill ? "select-none" : ""}`}>
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left font-medium px-2 py-1.5 min-w-[180px]">ชื่อรายการ *</th>
                    <th className="text-left font-medium px-2 py-1.5 w-32">Jar</th>
                    <th className="text-right font-medium px-2 py-1.5 w-28">จำนวน *</th>
                    <th className="text-left font-medium px-2 py-1.5 w-36">วิธีจ่าย</th>
                    <th className="text-left font-medium px-2 py-1.5 min-w-[120px]">หมายเหตุ</th>
                    <th className="px-2 py-1.5 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {draftRows.map((row, i) => {
                    const lo = fill ? Math.min(fill.startRow, fill.endRow) : -1;
                    const hi = fill ? Math.max(fill.startRow, fill.endRow) : -1;
                    const tdCls = (c: number) => {
                      const isActive = activeCell?.row === i && activeCell?.col === c;
                      const inFill = fill?.col === c && i >= lo && i <= hi;
                      return `relative px-2 py-1.5 align-top ${inFill ? "bg-indigo-50" : ""} ${isActive ? "ring-2 ring-inset ring-indigo-400" : ""}`;
                    };
                    const Handle = (c: number) =>
                      activeCell?.row === i && activeCell?.col === c ? (
                        <div
                          onMouseDown={(e) => { e.preventDefault(); setFill({ col: c, startRow: i, endRow: i }); }}
                          title="ลากลงเพื่อคัดลอก"
                          className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-indigo-600 border border-white cursor-crosshair z-10"
                        />
                      ) : null;
                    return (
                    <tr key={i} className="border-t border-gray-100"
                      onMouseEnter={() => setFill((f) => (f ? { ...f, endRow: i } : f))}>
                      <td className={tdCls(0)}>
                        <input
                          type="text"
                          list="expense-master-names"
                          value={row.name}
                          onChange={(e) => updateRow(i, { name: e.target.value })}
                          onFocus={() => setActiveCell({ row: i, col: 0 })}
                          onKeyDown={(e) => handleCellKeyDown(e, i, 0)}
                          onPaste={(e) => handlePaste(e, i, 0)}
                          placeholder="เลือกหรือพิมพ์ชื่อ"
                          className="block w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        />
                        {Handle(0)}
                      </td>
                      <td className={tdCls(1)}>
                        <select value={row.jarCode} onChange={(e) => updateRow(i, { jarCode: e.target.value })}
                          onFocus={() => setActiveCell({ row: i, col: 1 })}
                          onKeyDown={(e) => handleCellKeyDown(e, i, 1)}
                          className="block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                          {jars.map((j) => (
                            <option key={j.code} value={j.code}>{j.code}</option>
                          ))}
                        </select>
                        {Handle(1)}
                      </td>
                      <td className={tdCls(2)}>
                        <input type="number" value={row.amount} onChange={(e) => updateRow(i, { amount: e.target.value })}
                          onFocus={() => setActiveCell({ row: i, col: 2 })}
                          onKeyDown={(e) => handleCellKeyDown(e, i, 2)}
                          onPaste={(e) => handlePaste(e, i, 2)}
                          placeholder="0.00"
                          className="block w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        {Handle(2)}
                      </td>
                      <td className={tdCls(3)}>
                        <select value={row.paymentMethodId} onChange={(e) => updateRow(i, { paymentMethodId: e.target.value })}
                          onFocus={() => setActiveCell({ row: i, col: 3 })}
                          onKeyDown={(e) => handleCellKeyDown(e, i, 3)}
                          className="block w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                          <option value="">— ไม่ระบุ —</option>
                          {paymentMethods.map((pm) => {
                            const locked = lockedPaymentMethodIds.has(pm.id);
                            return (
                              <option key={pm.id} value={pm.id} disabled={locked}>
                                {pm.name}{locked ? " (ล็อก)" : ""}
                              </option>
                            );
                          })}
                        </select>
                        {Handle(3)}
                      </td>
                      <td className={tdCls(4)}>
                        <input type="text" value={row.note} onChange={(e) => updateRow(i, { note: e.target.value })}
                          onFocus={() => setActiveCell({ row: i, col: 4 })}
                          onKeyDown={(e) => handleCellKeyDown(e, i, 4)}
                          onPaste={(e) => handlePaste(e, i, 4)}
                          className="block w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        {Handle(4)}
                      </td>
                      <td className="px-2 py-1.5 align-top text-center">
                        <button type="button" onClick={() => removeRow(i)}
                          title="ลบแถว"
                          className="text-gray-300 hover:text-red-500 text-lg leading-none">×</button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mt-3 flex items-center justify-between">
                <button type="button" onClick={addRow}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">+ เพิ่มแถว</button>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={saveMaster} onChange={(e) => setSaveMaster(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400" />
                  <span className="text-xs text-gray-600">บันทึกชื่อใหม่ลง Master (ถ้ายังไม่มี)</span>
                </label>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end items-center">
              <button onClick={() => setShowExpenseModal(false)}
                className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
              <button onClick={saveExpense}
                disabled={savingExp || !draftRows.some((r) => r.name.trim() && r.amount)}
                className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {savingExp
                  ? "กำลังบันทึก..."
                  : `บันทึก ${draftRows.filter((r) => r.name.trim() && r.amount).length} รายการ`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
