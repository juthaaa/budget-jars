"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Area, Bar, ComposedChart, Legend, Line, ReferenceLine, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { formatTHB, monthLabel, yearMonthKey } from "@/lib/utils";
import { buildSchedule, rateSensitivity, type Prepayment, type ScheduleRow } from "@/lib/loan-schedule";
import { planToLoanInput, type LoanPlanDTO } from "../shared";
import LoanForm from "../LoanForm";

interface ScheduleApiRow extends ScheduleRow {
  seeded: boolean;
  expenseId: number | null;
  monthlyRecordId: number | null;
  prepaySeeded: boolean;
  prepayExpenseId: number | null;
  prepayMonthlyRecordId: number | null;
  prepayPending: boolean;
}
interface ScheduleResponse {
  rows: ScheduleApiRow[];
  bandSummaries: { label: string; fromInstallment: number; toInstallment: number; annualRate: number; payment: number; interestInBand: number; principalInBand: number; openingBalance: number; closingBalance: number }[];
  totalInterest: number;
  payoffMonths: number;
  payoffYear: number;
  payoffMonth: number;
  hasNegativeAmortization: boolean;
  averageRateFirst3Years: number;
  maxSeeded: number;
}

const QUICK_EXTRA = [400, 1000, 2000];

export default function LoanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [plan, setPlan] = useState<LoanPlanDTO | null>(null);
  const [schedule, setSchedule] = useState<ScheduleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditForm, setShowEditForm] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  const [extraAmount, setExtraAmount] = useState("");
  const [extraFrom, setExtraFrom] = useState("");
  const [savingExtra, setSavingExtra] = useState(false);
  const [oneOffAmount, setOneOffAmount] = useState("");
  const [oneOffInstallment, setOneOffInstallment] = useState("");
  const [savingOneOff, setSavingOneOff] = useState(false);

  async function fetchAll() {
    const [p, s] = await Promise.all([
      fetch(`/api/loan-plans/${id}`).then((r) => r.json()),
      fetch(`/api/loan-plans/${id}/schedule`).then((r) => r.json()),
    ]);
    setPlan(p);
    setSchedule(s);
    setLoading(false);
    if (extraFrom === "") setExtraFrom(String((s.maxSeeded ?? 0) + 1));
    const currentYear = new Date().getFullYear();
    setExpandedYears((prev) => (prev.size === 0 ? new Set([currentYear]) : prev));
  }

  useEffect(() => { fetchAll(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftPrepayments: Prepayment[] = useMemo(() => {
    if (!plan) return [];
    const base: Prepayment[] = plan.prepayments.map((p) => ({
      kind: p.kind as Prepayment["kind"], fromInstallment: p.fromInstallment, toInstallment: p.toInstallment, amount: p.amount,
    }));
    const extra = parseFloat(extraAmount);
    const from = parseInt(extraFrom);
    if (extra > 0 && from >= 1) base.push({ kind: "recurring", fromInstallment: from, amount: extra });
    return base;
  }, [plan, extraAmount, extraFrom]);

  const whatIf = useMemo(() => {
    if (!plan) return null;
    try {
      return buildSchedule(planToLoanInput(plan, draftPrepayments));
    } catch {
      return null;
    }
  }, [plan, draftPrepayments]);

  const baseline = useMemo(() => {
    if (!plan) return null;
    try {
      return buildSchedule(planToLoanInput(plan, []));
    } catch {
      return null;
    }
  }, [plan]);

  const hasDraft = parseFloat(extraAmount) > 0;

  async function saveDraftExtra() {
    if (!hasDraft) return;
    setSavingExtra(true);
    const res = await fetch(`/api/loan-plans/${id}/prepayments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "recurring", fromInstallment: parseInt(extraFrom), amount: parseFloat(extraAmount) }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "เกิดข้อผิดพลาด");
      setSavingExtra(false);
      return;
    }
    setExtraAmount("");
    setSavingExtra(false);
    await fetchAll();
  }

  async function addOneOff() {
    const amt = parseFloat(oneOffAmount);
    const n = parseInt(oneOffInstallment);
    if (!amt || amt <= 0 || !n || n < 1) return;
    setSavingOneOff(true);
    const res = await fetch(`/api/loan-plans/${id}/prepayments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "one_off", fromInstallment: n, amount: amt }),
    });
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "เกิดข้อผิดพลาด");
      setSavingOneOff(false);
      return;
    }
    setOneOffAmount("");
    setOneOffInstallment("");
    setSavingOneOff(false);
    await fetchAll();
  }

  async function deletePrepayment(prepaymentId: number) {
    if (!confirm("ลบรายการโปะนี้?")) return;
    await fetch(`/api/loan-plans/${id}/prepayments/${prepaymentId}`, { method: "DELETE" });
    await fetchAll();
  }

  async function deletePlan() {
    if (!plan || !schedule) return;
    const msg =
      schedule.maxSeeded > 0
        ? `ลบสินเชื่อนี้? งวดที่ถูกดึงเข้าเดือนไปแล้ว ${schedule.maxSeeded} งวด จะยังอยู่ในเดือนนั้น ๆ แต่จะไม่ผูกกับสินเชื่อนี้อีก`
        : "ลบสินเชื่อนี้?";
    if (!confirm(msg)) return;
    await fetch(`/api/loan-plans/${id}`, { method: "DELETE" });
    router.push("/loans");
  }

  const sensitivityBand = useMemo(() => {
    if (!plan) return null;
    const refBands = plan.bands.filter((b) => b.rateType === "ref_spread" && b.refCode);
    return refBands.length > 0 ? refBands[refBands.length - 1] : null;
  }, [plan]);

  const sensitivity = useMemo(() => {
    if (!plan || !sensitivityBand?.refCode) return null;
    try {
      const input = planToLoanInput(plan);
      const currentRate = plan.referenceRates.filter((r) => r.code === sensitivityBand.refCode).slice(-1)[0]?.value ?? 0;
      const from = Math.max(0, Math.floor(currentRate - 2));
      const to = Math.ceil(currentRate + 4);
      return rateSensitivity(input, { refCode: sensitivityBand.refCode, from, to, step: 0.25, atInstallment: sensitivityBand.fromInstallment });
    } catch {
      return null;
    }
  }, [plan, sensitivityBand]);

  const chartData = useMemo(() => {
    if (!whatIf || !baseline) return [];
    const byYear = new Map<number, { year: number; balance: number; baselineBalance: number; cumulativeInterest: number }>();
    for (const row of whatIf.rows) {
      byYear.set(row.year, { year: row.year, balance: row.balance, baselineBalance: byYear.get(row.year)?.baselineBalance ?? row.balance, cumulativeInterest: row.cumulativeInterest });
    }
    for (const row of baseline.rows) {
      const existing = byYear.get(row.year);
      if (existing) existing.baselineBalance = row.balance;
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }, [whatIf, baseline]);

  const principalVsInterestData = useMemo(() => {
    if (!schedule) return [];
    const byYear = new Map<number, { year: number; principal: number; extra: number; interest: number; months: number }>();
    for (const row of schedule.rows) {
      const entry = byYear.get(row.year) ?? { year: row.year, principal: 0, extra: 0, interest: 0, months: 0 };
      const extraPortion = Math.min(row.extra, row.principalPaid);
      entry.principal += row.principalPaid - extraPortion;
      entry.extra += extraPortion;
      entry.interest += row.interest;
      entry.months += 1;
      byYear.set(row.year, entry);
    }
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }, [schedule]);

  const crossoverRow = useMemo(() => {
    if (!schedule) return null;
    const monthsByYear = new Map<number, number>();
    for (const row of schedule.rows) monthsByYear.set(row.year, (monthsByYear.get(row.year) ?? 0) + 1);
    // Skip stub/partial years (first year often has a short first period, last
    // year is a partial payoff year) — a crossover found there is an artifact
    // of the short period's tiny prorated interest, not a real trend change.
    // Also exclude prepayment (โปะ) from the principal side — the crossover
    // should reflect the loan's natural amortization curve, not be pulled
    // earlier by extra payments the borrower chose to make.
    return schedule.rows.find((r) => {
      if (monthsByYear.get(r.year) !== 12) return false;
      const regularPrincipal = r.principalPaid - Math.min(r.extra, r.principalPaid);
      return regularPrincipal > r.interest;
    }) ?? null;
  }, [schedule]);

  if (loading || !plan || !schedule) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  const currentInstallment = schedule.maxSeeded + 1;
  const currentRow = schedule.rows.find((r) => r.installmentNumber === currentInstallment);
  const previousRow = schedule.rows.find((r) => r.installmentNumber === currentInstallment - 1);
  const currentOpeningBalance = previousRow ? previousRow.balance : plan.principalAmount;
  const totalMonthlyFee = plan.monthlyFeeAmount ?? 0;

  const rowsByYear = new Map<number, ScheduleApiRow[]>();
  for (const row of schedule.rows) {
    if (!rowsByYear.has(row.year)) rowsByYear.set(row.year, []);
    rowsByYear.get(row.year)!.push(row);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/loans" className="text-xs text-gray-400 hover:text-indigo-600">&larr; สินเชื่อทั้งหมด</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">{plan.name}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowEditForm(true)} className="text-sm text-gray-600 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">แก้ไข</button>
          <button onClick={deletePlan} className="text-sm text-red-500 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">ลบ</button>
        </div>
      </div>

      {/* สรุป */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "ยอดคงเหลือ", value: currentRow ? formatTHB(currentOpeningBalance) : "—" },
          { label: `งวดที่ ${schedule.maxSeeded}/${schedule.payoffMonths}`, value: `${((schedule.maxSeeded / schedule.payoffMonths) * 100).toFixed(0)}%` },
          { label: "ค่างวดเดือนนี้", value: currentRow ? formatTHB(currentRow.payment + currentRow.extra + totalMonthlyFee) : "—" },
          { label: "อัตราปัจจุบัน", value: currentRow ? `${currentRow.annualRate.toFixed(3)}%` : "—" },
          { label: "ดอกเบี้ยรวมทั้งสัญญา", value: formatTHB(schedule.totalInterest) },
          { label: "ผ่อนหมด", value: `${monthLabel(schedule.payoffYear, schedule.payoffMonth)}` },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className="text-sm font-semibold text-gray-900 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {schedule.hasNegativeAmortization && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">
          ⚠️ มีบางช่วงที่ค่างวดไม่พอจ่ายดอกเบี้ย (เงินต้นไม่ลด)
        </div>
      )}

      {/* สรุปรายขั้น */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">สรุปรายขั้นดอกเบี้ย</h2>
          <p className="text-xs text-gray-400 mt-0.5">อัตราเฉลี่ย 3 ปีแรก ≈ {schedule.averageRateFirst3Years.toFixed(2)}%</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="text-left px-4 py-2">ช่วงงวด</th>
              <th className="text-right px-3 py-2">อัตรา</th>
              <th className="text-right px-3 py-2">ค่างวด</th>
              <th className="text-right px-3 py-2">ดอกเบี้ยในช่วง</th>
              <th className="text-right px-3 py-2">เงินต้นที่ลด</th>
              <th className="text-right px-3 py-2">คงเหลือปลายช่วง</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {schedule.bandSummaries.map((b, i) => (
              <tr key={i}>
                <td className="px-4 py-2 text-gray-800">{b.label} ({b.fromInstallment}–{b.toInstallment})</td>
                <td className="px-3 py-2 text-right">{b.annualRate.toFixed(3)}%</td>
                <td className="px-3 py-2 text-right font-medium">{formatTHB(b.payment)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{formatTHB(b.interestInBand)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{formatTHB(b.principalInBand)}</td>
                <td className="px-3 py-2 text-right">{formatTHB(b.closingBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* โปะ */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">โปะ (Prepayment)</h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs text-gray-500">โปะรายเดือน (ตั้งแต่งวดที่)</p>
            <div className="flex gap-2">
              <input type="number" value={extraFrom} min={schedule.maxSeeded + 1} onChange={(e) => setExtraFrom(e.target.value)} placeholder="งวดที่"
                className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              <input type="number" value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} placeholder="จำนวน/เดือน"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            {schedule.maxSeeded > 0 && (
              <p className="text-xs text-gray-400">งวดที่ 1–{schedule.maxSeeded} ถูกดึงเข้าเดือนไปแล้ว เริ่มโปะได้ตั้งแต่งวดที่ {schedule.maxSeeded + 1}</p>
            )}
            <div className="flex gap-1.5">
              {QUICK_EXTRA.map((v) => (
                <button key={v} onClick={() => setExtraAmount(String(v))}
                  className="text-xs border border-gray-300 rounded-full px-2.5 py-1 hover:bg-gray-50">+{v.toLocaleString()}</button>
              ))}
            </div>
            <button onClick={saveDraftExtra} disabled={!hasDraft || savingExtra || parseInt(extraFrom) <= schedule.maxSeeded}
              className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              {savingExtra ? "กำลังบันทึก..." : "บันทึกแผนโปะ"}
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-gray-500">โปะก้อนเดียว (ระบุงวด)</p>
            <div className="flex gap-2">
              <input type="number" value={oneOffInstallment} min={schedule.maxSeeded + 1} onChange={(e) => setOneOffInstallment(e.target.value)} placeholder="งวดที่"
                className="w-24 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              <input type="number" value={oneOffAmount} onChange={(e) => setOneOffAmount(e.target.value)} placeholder="จำนวนเงิน"
                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
              <button onClick={addOneOff} disabled={savingOneOff || parseInt(oneOffInstallment) <= schedule.maxSeeded}
                className="text-sm bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-900 disabled:opacity-50">+ เพิ่ม</button>
            </div>
          </div>
        </div>

        {hasDraft && whatIf && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
            ผ่อนหมด {(whatIf.payoffMonths / 12).toFixed(1)} ปี
            {baseline && whatIf.payoffMonths < baseline.payoffMonths && ` (เร็วขึ้น ${((baseline.payoffMonths - whatIf.payoffMonths) / 12).toFixed(1)} ปี)`}
            {" · "}ดอกเบี้ยรวม {formatTHB(whatIf.totalInterest)}
            {baseline && ` · ประหยัด ${formatTHB(baseline.totalInterest - whatIf.totalInterest)}`}
          </div>
        )}

        {plan.prepayments.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-500">รายการโปะที่บันทึกไว้</p>
            {plan.prepayments.map((p) => {
              const locked = p.fromInstallment <= schedule.maxSeeded;
              return (
                <div key={p.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <span>
                    {locked && <span title="งวดเริ่มต้นถูกดึงเข้าเดือนไปแล้ว — ถ้าจะแก้ ให้ลบแล้วสร้างใหม่" className="mr-1">🔒</span>}
                    {p.kind === "one_off" ? "ก้อนเดียว" : "ต่อเนื่อง"} งวดที่ {p.fromInstallment}{p.toInstallment ? `–${p.toInstallment}` : p.kind === "recurring" ? "+" : ""}
                    {" · "}<span className="font-medium">{formatTHB(p.amount)}</span>
                  </span>
                  <button onClick={() => deletePrepayment(p.id!)} className="text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* กราฟ */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">ยอดคงเหลือ &amp; ดอกเบี้ยสะสม</h2>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`} />
            <Tooltip formatter={(v) => formatTHB(Number(v))} />
            <Area type="monotone" dataKey="balance" name="ยอดคงเหลือ" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
            {hasDraft && <Line type="monotone" dataKey="baselineBalance" name="ยอดคงเหลือ (ไม่โปะ)" stroke="#9ca3af" strokeDasharray="4 4" dot={false} />}
            <Line type="monotone" dataKey="cumulativeInterest" name="ดอกเบี้ยสะสม" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* เงินต้น vs ดอกเบี้ยรายปี */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700">เงินต้นตัดต่อปี เทียบ ดอกเบี้ยต่อปี</h2>
        <p className="text-xs text-gray-400 mt-0.5 mb-4">
          {crossoverRow
            ? <>จุดตัด: งวดที่ {crossoverRow.installmentNumber} ({crossoverRow.day}/{crossoverRow.month}/{crossoverRow.year + 543}) — เริ่มตัดเงินต้นมากกว่าดอกเบี้ย</>
            : "ยังไม่พบจุดที่เงินต้นตัดมากกว่าดอกเบี้ยตลอดสัญญา"}
        </p>
        <ResponsiveContainer width="100%" height={290}>
          <ComposedChart data={principalVsInterestData} margin={{ top: 4, right: 16, left: 0, bottom: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="year"
              height={32}
              tick={(props) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { x, y, payload } = props as any;
                const entry = principalVsInterestData.find((d) => d.year === payload.value);
                const partial = entry && entry.months !== 12;
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text dy={12} textAnchor="middle" fontSize={11} fill="#6b7280">{payload.value + 543}</text>
                    {partial && <text dy={24} textAnchor="middle" fontSize={9} fill="#9ca3af">({entry!.months} ด.)</text>}
                  </g>
                );
              }}
            />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1e3).toFixed(0)}K`} />
            <Tooltip
              formatter={(v) => formatTHB(Number(v))}
              labelFormatter={(y, tooltipPayload) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const months = (tooltipPayload as any)?.[0]?.payload?.months;
                return `ปี ${y + 543}${months && months !== 12 ? ` (${months} เดือน)` : ""}`;
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {crossoverRow && (
              <ReferenceLine
                x={crossoverRow.year}
                stroke="#6b7280"
                strokeDasharray="4 4"
                label={(props) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const { viewBox } = props as any;
                  const idx = principalVsInterestData.findIndex((d) => d.year === crossoverRow.year);
                  const nearRightEdge = idx > principalVsInterestData.length - 4;
                  const boxWidth = 158;
                  const boxX = nearRightEdge ? viewBox.x - 8 - boxWidth : viewBox.x + 8;
                  const boxY = viewBox.y + 4;
                  const regularPrincipal = crossoverRow.principalPaid - Math.min(crossoverRow.extra, crossoverRow.principalPaid);
                  return (
                    <g>
                      <rect x={boxX} y={boxY} width={boxWidth} height={54} rx={5} fill="#ffffff" fillOpacity={0.96} stroke="#d1d5db" />
                      <text x={boxX + 8} y={boxY + 15} fontSize={10} fontWeight={600} fill="#1f2937">
                        {`งวดที่ ${crossoverRow.installmentNumber} (${crossoverRow.day}/${crossoverRow.month}/${crossoverRow.year + 543})`}
                      </text>
                      <rect x={boxX + 8} y={boxY + 23} width={8} height={8} fill="#1baf7a" />
                      <text x={boxX + 20} y={boxY + 31} fontSize={10} fill="#1f2937">
                        {`เงินต้น ${formatTHB(regularPrincipal)}`}
                      </text>
                      <rect x={boxX + 8} y={boxY + 37} width={8} height={8} fill="#eb6834" />
                      <text x={boxX + 20} y={boxY + 45} fontSize={10} fill="#1f2937">
                        {`ดอกเบี้ย ${formatTHB(crossoverRow.interest)}`}
                      </text>
                    </g>
                  );
                }}
              />
            )}
            <Bar dataKey="principal" name="เงินต้นที่ตัด" stackId="pay" fill="#1baf7a" stroke="#fff" strokeWidth={2} />
            <Bar dataKey="extra" name="โปะ" stackId="pay" fill="#2a78d6" stroke="#fff" strokeWidth={2} />
            <Bar dataKey="interest" name="ดอกเบี้ย" stackId="pay" fill="#eb6834" stroke="#fff" strokeWidth={2} radius={[3, 3, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* ตารางผ่อน */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">ตารางผ่อนรายงวด</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {[...rowsByYear.entries()].map(([year, rows]) => {
            const isOpen = expandedYears.has(year);
            const yearPaid = rows.reduce((s, r) => s + r.payment + r.extra, 0);
            const yearInterest = rows.reduce((s, r) => s + r.interest, 0);
            const closing = rows[rows.length - 1].balance;
            return (
              <div key={year}>
                <button
                  onClick={() => setExpandedYears((prev) => { const next = new Set(prev); next.has(year) ? next.delete(year) : next.add(year); return next; })}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-sm"
                >
                  <span className="font-medium text-gray-800">{year + 543}</span>
                  <span className="text-xs text-gray-500">รวมจ่าย {formatTHB(yearPaid)} · ดอกเบี้ย {formatTHB(yearInterest)} · คงเหลือ {formatTHB(closing)}</span>
                </button>
                {isOpen && (
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 text-gray-500">
                      <tr>
                        <th className="text-left px-4 py-1.5">งวด</th>
                        <th className="text-left px-2 py-1.5">เดือน</th>
                        <th className="text-right px-2 py-1.5">อัตรา</th>
                        <th className="text-right px-2 py-1.5">ค่างวด</th>
                        <th className="text-right px-2 py-1.5">โปะ</th>
                        <th className="text-right px-2 py-1.5">ดอกเบี้ย</th>
                        <th className="text-right px-2 py-1.5">เงินต้น</th>
                        <th className="text-right px-2 py-1.5">คงเหลือ</th>
                        <th className="text-right px-4 py-1.5">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map((r) => (
                        <tr key={r.installmentNumber} className={r.seeded ? "bg-indigo-50/40" : ""}>
                          <td className="px-4 py-1.5">{r.installmentNumber}</td>
                          <td className="px-2 py-1.5">{r.day}/{r.month}/{r.year + 543}</td>
                          <td className="px-2 py-1.5 text-right">{r.annualRate.toFixed(3)}%</td>
                          <td className="px-2 py-1.5 text-right">{formatTHB(r.payment)}</td>
                          <td className="px-2 py-1.5 text-right text-green-600">{r.extra > 0 ? formatTHB(r.extra) : "—"}</td>
                          <td className="px-2 py-1.5 text-right text-gray-500">{formatTHB(r.interest)}</td>
                          <td className={`px-2 py-1.5 text-right ${r.negativeAmortization ? "text-red-600" : ""}`}>{formatTHB(r.principalPaid)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{formatTHB(r.balance)}</td>
                          <td className="px-4 py-1.5 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              {r.seeded && r.monthlyRecordId ? (
                                <Link href={`/month/${yearMonthKey(r.year, r.month)}`} className="text-indigo-600 hover:underline">ดึงแล้ว</Link>
                              ) : (
                                <span className="text-gray-300">รอ</span>
                              )}
                              {r.prepaySeeded && r.prepayMonthlyRecordId ? (
                                <Link href={`/month/${yearMonthKey(r.year, r.month)}`} className="text-green-600 hover:underline text-[10px]">โปะแล้ว</Link>
                              ) : r.seeded && !r.prepayPending ? (
                                <span className="text-gray-300 text-[10px]">ไม่โปะ</span>
                              ) : r.prepayPending || r.extra > 0 ? (
                                <span className="text-amber-500 text-[10px]">รอโปะ</span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ความเสี่ยงอัตราลอยตัว */}
      {sensitivity && sensitivity.criticalRefRate != null && (
        <div className={`bg-white rounded-xl border p-5 space-y-3 ${sensitivity.headroom != null && sensitivity.headroom < 1 ? "border-red-300" : "border-gray-200"}`}>
          <h2 className="text-sm font-semibold text-gray-700">ความเสี่ยงอัตราลอยตัว ({sensitivityBand?.refCode})</h2>
          <p className={`text-sm ${sensitivity.headroom != null && sensitivity.headroom < 1 ? "text-red-600 font-medium" : "text-gray-600"}`}>
            {sensitivityBand?.refCode} ขึ้นได้อีก {sensitivity.headroom?.toFixed(2)}% ก่อนที่ค่างวดจะไม่พอจ่ายดอกเบี้ย
            {" "}({sensitivityBand?.refCode} วิกฤต {sensitivity.criticalRefRate.toFixed(2)}%)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-2 py-1.5">{sensitivityBand?.refCode}</th>
                  <th className="text-right px-2 py-1.5">อัตราจริง</th>
                  <th className="text-right px-2 py-1.5">ดอกเบี้ย/เดือน</th>
                  <th className="text-right px-2 py-1.5">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sensitivity.points.map((pt, i) => (
                  <tr key={i} className={pt.negative ? "bg-red-50" : ""}>
                    <td className="px-2 py-1.5">{pt.refRate.toFixed(2)}%</td>
                    <td className="px-2 py-1.5 text-right">{pt.annualRate.toFixed(3)}%</td>
                    <td className={`px-2 py-1.5 text-right ${pt.negative ? "text-red-600" : ""}`}>{formatTHB(pt.monthlyInterest)}</td>
                    <td className="px-2 py-1.5 text-right">{pt.negative ? <span className="text-red-600 text-[10px] font-medium">เงินต้นไม่ลด</span> : "ปกติ"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showEditForm && (
        <LoanForm
          initial={plan}
          onClose={() => setShowEditForm(false)}
          onSaved={() => { setShowEditForm(false); fetchAll(); }}
        />
      )}
    </div>
  );
}
