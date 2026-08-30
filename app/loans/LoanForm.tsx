"use client";

import { useEffect, useMemo, useState } from "react";
import { formatTHB } from "@/lib/utils";
import { buildSchedule } from "@/lib/loan-schedule";
import { emptyBand, planToLoanInput, type BandDTO, type LoanPlanDTO, type ReferenceRateDTO } from "./shared";

interface JarOption { id: number; name: string; code: string }
interface PaymentMethodOption { id: number; name: string; code: string }

const RATE_TYPE_OPTIONS = [
  { value: "absolute", label: "ระบุอัตรา" },
  { value: "ref_spread", label: "อ้างอิง ± ส่วนต่าง" },
];

export default function LoanForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: LoanPlanDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const maxSeeded = initial
    ? initial.items.reduce((m, i) => (i._count.expenses > 0 ? Math.max(m, i.installmentNumber ?? 0) : m), 0)
    : 0;

  const [jars, setJars] = useState<JarOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [name, setName] = useState(initial?.name ?? "");
  const [jarCode, setJarCode] = useState(initial?.jarCode ?? "");
  const [paymentMethodId, setPaymentMethodId] = useState<string>(
    initial?.paymentMethodId != null ? String(initial.paymentMethodId) : ""
  );
  const [principal, setPrincipal] = useState(initial ? String(initial.principalAmount) : "");
  const [years, setYears] = useState(initial ? String(initial.termMonths / 12) : "");
  const [startDate, setStartDate] = useState(initial ? initial.startDate.slice(0, 10) : "");
  const [firstPaymentDate, setFirstPaymentDate] = useState(initial?.firstPaymentDate ? initial.firstPaymentDate.slice(0, 10) : "");
  const [interestMode, setInterestMode] = useState<"monthly" | "daily">(initial?.interestMode ?? "monthly");
  const [monthlyFeeAmount, setMonthlyFeeAmount] = useState(initial?.monthlyFeeAmount != null ? String(initial.monthlyFeeAmount) : "");
  const [monthlyFeeMonths, setMonthlyFeeMonths] = useState(initial?.monthlyFeeMonths != null ? String(initial.monthlyFeeMonths) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [bands, setBands] = useState<BandDTO[]>(initial?.bands.length ? initial.bands : [emptyBand(1)]);
  const [rates, setRates] = useState<ReferenceRateDTO[]>(
    initial?.referenceRates.length
      ? initial.referenceRates
      : [{ code: "MRR", value: 0, effectiveFrom: new Date().toISOString().slice(0, 10), isAssumption: false, note: null }]
  );
  const [yearToAdd, setYearToAdd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/jars").then((r) => r.json()),
      fetch("/api/payment-methods").then((r) => r.json()),
    ]).then(([j, p]) => {
      setJars(j);
      setPaymentMethods(p);
      if (!jarCode && j.length > 0) setJarCode(j[0].code);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const termMonths = Math.round((parseFloat(years) || 0) * 12);

  function updateBand(idx: number, patch: Partial<BandDTO>) {
    setBands((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
  }
  function removeBand(idx: number) {
    setBands((prev) => prev.filter((_, i) => i !== idx));
  }
  function addBand() {
    const last = bands[bands.length - 1];
    const nextFrom = last?.toInstallment != null ? last.toInstallment + 1 : (last ? undefined : 1);
    setBands((prev) => [...prev, emptyBand(nextFrom ?? (last ? last.fromInstallment + 1 : 1))]);
  }
  function addYearBand() {
    const y = parseInt(yearToAdd);
    if (!y || y < 1) return;
    const from = (y - 1) * 12 + 1;
    const to = y * 12;
    setBands((prev) => [...prev, { ...emptyBand(from), toInstallment: to, label: `ปีที่ ${y}` }]);
    setYearToAdd("");
  }

  function updateRate(idx: number, patch: Partial<ReferenceRateDTO>) {
    setRates((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeRate(idx: number) {
    setRates((prev) => prev.filter((_, i) => i !== idx));
  }
  function addRate() {
    setRates((prev) => [...prev, { code: "MRR", value: 0, effectiveFrom: new Date().toISOString().slice(0, 10), isAssumption: true, note: null }]);
  }

  const preview = useMemo(() => {
    if (!termMonths || !principal || !startDate || bands.length === 0) return null;
    try {
      const fakePlan: LoanPlanDTO = {
        id: 0, name, jarCode, paymentMethodId: null, paymentMethod: null,
        principalAmount: parseFloat(principal) || 0, termMonths, startDate,
        firstPaymentDate: firstPaymentDate || null,
        interestMode, monthlyFeeAmount: null, monthlyFeeMonths: null, note: null,
        bands, referenceRates: rates, prepayments: [], items: [], seededCount: 0,
      };
      return buildSchedule(planToLoanInput(fakePlan));
    } catch {
      return null;
    }
  }, [termMonths, principal, startDate, firstPaymentDate, bands, rates, name, jarCode, interestMode]);

  async function save() {
    setError(null);
    if (!name.trim()) return setError("ต้องระบุชื่อสินเชื่อ");
    if (!principal || parseFloat(principal) <= 0) return setError("ยอดกู้ต้องมากกว่า 0");
    if (!termMonths || termMonths < 1) return setError("ระยะเวลากู้ต้องมากกว่า 0 ปี");
    if (!startDate) return setError("ต้องระบุวันที่เริ่มสัญญา");
    if (firstPaymentDate && firstPaymentDate <= startDate) return setError("วันครบกำหนดชำระงวดแรกต้องอยู่หลังวันที่เริ่มสัญญา");

    setSaving(true);
    const body = {
      name: name.trim(),
      jarCode,
      paymentMethodId: paymentMethodId ? Number(paymentMethodId) : null,
      principalAmount: parseFloat(principal),
      termMonths,
      startDate,
      firstPaymentDate: firstPaymentDate || null,
      interestMode,
      monthlyFeeAmount: monthlyFeeAmount ? parseFloat(monthlyFeeAmount) : null,
      monthlyFeeMonths: monthlyFeeMonths ? parseInt(monthlyFeeMonths) : null,
      note: note || null,
      bands: bands.map((b, i) => ({ ...b, sortOrder: i })),
      referenceRates: rates,
    };

    const res = await fetch(isEdit ? `/api/loan-plans/${initial!.id}` : "/api/loan-plans", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "บันทึกไม่สำเร็จ" }));
      setError(err.error ?? "บันทึกไม่สำเร็จ");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold">{isEdit ? "แก้ไขสินเชื่อ" : "เพิ่มสินเชื่อบ้าน"}</h3>
        </div>

        <div className="p-5 space-y-6 overflow-y-auto">
          {isEdit && maxSeeded > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg px-3 py-2">
              งวดที่ 1–{maxSeeded} ถูกดึงเข้าเดือนไปแล้ว จึงล็อกชื่อ/Jar/ยอดกู้/วันที่เริ่มสัญญา/วันครบกำหนดงวดแรก
            </div>
          )}

          {/* ข้อมูลสินเชื่อ */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase">ข้อมูลสินเชื่อ</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="block col-span-2">
                <span className="text-xs text-gray-500">ชื่อสินเชื่อ *</span>
                <input value={name} onChange={(e) => setName(e.target.value)} disabled={isEdit && maxSeeded > 0}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Jar *</span>
                <select value={jarCode} onChange={(e) => setJarCode(e.target.value)} disabled={isEdit && maxSeeded > 0}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100">
                  {jars.map((j) => <option key={j.id} value={j.code}>{j.name} ({j.code})</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">วิธีจ่าย</span>
                <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400">
                  <option value="">— ไม่ระบุ —</option>
                  {paymentMethods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">ยอดกู้ (บาท) *</span>
                <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} disabled={isEdit && maxSeeded > 0}
                  placeholder="1620000"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">ระยะเวลากู้ (ปี) *</span>
                <input type="number" value={years} onChange={(e) => setYears(e.target.value)} placeholder="40"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">วันที่เริ่มสัญญา (เบิกเงินกู้) *</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={isEdit && maxSeeded > 0}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">วันครบกำหนดชำระงวดแรก</span>
                <input type="date" value={firstPaymentDate} onChange={(e) => setFirstPaymentDate(e.target.value)} disabled={isEdit && maxSeeded > 0}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100" />
                <span className="text-[11px] text-gray-400">ไม่ใส่ = 1 เดือนหลังวันที่เริ่มสัญญา (ไม่มีงวดสั้น). ถ้าเบิกเงินใกล้สิ้นเดือนแต่กำหนดจ่ายเป็นวันคงที่ (เช่น ทุกวันที่ 5) ให้ใส่วันที่ต่างกัน — งวดแรกจะคิดดอกเบี้ยตามจำนวนวันจริงแทน ÷12 เต็มเดือน</span>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">ค่าประกัน/ค่าธรรมเนียมรายเดือน</span>
                <input type="number" value={monthlyFeeAmount} onChange={(e) => setMonthlyFeeAmount(e.target.value)} placeholder="400"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">จำนวนเดือนของค่าธรรมเนียม</span>
                <input type="number" value={monthlyFeeMonths} onChange={(e) => setMonthlyFeeMonths(e.target.value)} placeholder="360"
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
              <label className="block col-span-2">
                <span className="text-xs text-gray-500">โน้ต</span>
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
              </label>
            </div>
          </section>

          {/* อัตราอ้างอิง */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">อัตราอ้างอิง (MRR / MLR / MOR)</h4>
              <button onClick={addRate} className="text-xs text-indigo-600 hover:underline">+ เพิ่มแถว</button>
            </div>
            <div className="space-y-2">
              {rates.map((r, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input value={r.code} onChange={(e) => updateRate(i, { code: e.target.value.toUpperCase() })}
                    placeholder="MRR" className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  <input type="date" value={r.effectiveFrom.slice(0, 10)} onChange={(e) => updateRate(i, { effectiveFrom: e.target.value })}
                    className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  <input type="number" step="0.001" value={r.value} onChange={(e) => updateRate(i, { value: parseFloat(e.target.value) || 0 })}
                    placeholder="6.045" className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                  <label className="col-span-3 flex items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={r.isAssumption} onChange={(e) => updateRate(i, { isAssumption: e.target.checked })} />
                    เป็นค่าคาดการณ์
                  </label>
                  <button onClick={() => removeRate(i)} className="col-span-1 text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                </div>
              ))}
            </div>
          </section>

          {/* ขั้นดอกเบี้ย */}
          <section className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">ขั้นดอกเบี้ย</h4>
              <div className="flex items-center gap-2">
                <input type="number" value={yearToAdd} onChange={(e) => setYearToAdd(e.target.value)} placeholder="ปีที่"
                  className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-xs" />
                <button onClick={addYearBand} className="text-xs text-indigo-600 hover:underline">+ เพิ่มขั้นตามปี</button>
                <button onClick={addBand} className="text-xs text-indigo-600 hover:underline">+ เพิ่มขั้น</button>
              </div>
            </div>
            <div className="space-y-2">
              {bands.map((b, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-center bg-gray-50 rounded-lg p-2">
                  <input type="number" value={b.fromInstallment} onChange={(e) => updateBand(i, { fromInstallment: parseInt(e.target.value) || 1 })}
                    className="col-span-1 border border-gray-300 rounded px-1.5 py-1 text-xs" title="งวดเริ่มต้น" />
                  <span className="col-span-1 text-center text-xs text-gray-400">ถึง</span>
                  <input type="number" value={b.toInstallment ?? ""} onChange={(e) => updateBand(i, { toInstallment: e.target.value ? parseInt(e.target.value) : null })}
                    placeholder="สิ้นสุด" className="col-span-1 border border-gray-300 rounded px-1.5 py-1 text-xs" title="งวดสิ้นสุด (ว่าง = ถึงจบสัญญา)" />
                  <select value={b.rateType} onChange={(e) => updateBand(i, { rateType: e.target.value })}
                    className="col-span-2 border border-gray-300 rounded px-1.5 py-1 text-xs">
                    {RATE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {b.rateType === "ref_spread" && (
                    <select value={b.refCode ?? ""} onChange={(e) => updateBand(i, { refCode: e.target.value })}
                      className="col-span-1 border border-gray-300 rounded px-1.5 py-1 text-xs">
                      <option value="">รหัส</option>
                      {[...new Set(rates.map((r) => r.code))].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                  <input type="number" step="0.001" value={b.value} onChange={(e) => updateBand(i, { value: parseFloat(e.target.value) || 0 })}
                    placeholder={b.rateType === "ref_spread" ? "ส่วนต่าง เช่น -0.75" : "อัตรา %"}
                    className={b.rateType === "ref_spread" ? "col-span-2 border border-gray-300 rounded px-1.5 py-1 text-xs" : "col-span-3 border border-gray-300 rounded px-1.5 py-1 text-xs"} />
                  <input type="number" value={b.paymentOverride ?? ""} onChange={(e) => updateBand(i, { paymentOverride: e.target.value ? parseFloat(e.target.value) : null })}
                    placeholder="ค่างวดที่แจ้ง (ไม่ใส่=คำนวณ)" className="col-span-2 border border-gray-300 rounded px-1.5 py-1 text-xs" />
                  <input value={b.label ?? ""} onChange={(e) => updateBand(i, { label: e.target.value })}
                    placeholder="ชื่อขั้น" className="col-span-1 border border-gray-300 rounded px-1.5 py-1 text-xs" />
                  <button onClick={() => removeBand(i)} className="col-span-1 text-gray-400 hover:text-red-500 text-xs">ลบ</button>
                </div>
              ))}
            </div>

            <label className="flex items-center gap-4 text-xs text-gray-500 pt-1">
              <span>วิธีคิดดอกเบี้ย:</span>
              <label className="flex items-center gap-1">
                <input type="radio" checked={interestMode === "monthly"} onChange={() => setInterestMode("monthly")} /> รายเดือน (÷12)
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={interestMode === "daily"} onChange={() => setInterestMode("daily")} /> รายวัน (×วัน÷365)
              </label>
            </label>
          </section>

          {/* พรีวิว */}
          {preview && (
            <section className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">ตัวอย่างตารางผ่อน</h4>
              <div className="text-xs text-gray-600 mb-1">
                อัตราเฉลี่ย 3 ปีแรก ≈ <span className="font-semibold">{preview.averageRateFirst3Years.toFixed(2)}%</span>
                {" · "}ดอกเบี้ยรวม ≈ <span className="font-semibold">{formatTHB(preview.totalInterest)}</span>
                {" · "}ผ่อนหมดปีที่ {(preview.payoffMonths / 12).toFixed(1)}
                {preview.hasNegativeAmortization && <span className="text-red-600 font-semibold"> · มีบางขั้นเงินต้นไม่ลด</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-2 py-1.5">ขั้น</th>
                      <th className="text-left px-2 py-1.5">งวดที่</th>
                      <th className="text-right px-2 py-1.5">อัตรา</th>
                      <th className="text-right px-2 py-1.5">ค่างวด</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.bands.map((b, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5">{b.label}</td>
                        <td className="px-2 py-1.5">{b.fromInstallment}–{b.toInstallment}</td>
                        <td className="px-2 py-1.5 text-right">{b.annualRate.toFixed(3)}%</td>
                        <td className="px-2 py-1.5 text-right font-medium">{formatTHB(b.payment)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-100">ยกเลิก</button>
          <button onClick={save} disabled={saving}
            className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
