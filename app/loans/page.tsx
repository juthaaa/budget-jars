"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatTHB } from "@/lib/utils";
import { buildSchedule } from "@/lib/loan-schedule";
import { planToLoanInput, type LoanPlanDTO } from "./shared";
import LoanForm from "./LoanForm";

function LoanCard({ plan }: { plan: LoanPlanDTO }) {
  const schedule = useMemo(() => {
    try {
      return buildSchedule(planToLoanInput(plan));
    } catch {
      return null;
    }
  }, [plan]);

  const currentInstallment = plan.seededCount + 1;
  const currentRow = schedule?.rows.find((r) => r.installmentNumber === currentInstallment);
  const totalInstallments = schedule?.payoffMonths ?? plan.termMonths;
  const progress = Math.min(100, (plan.seededCount / totalInstallments) * 100);

  return (
    <Link href={`/loans/${plan.id}`} className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{plan.name}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{plan.jarCode}{plan.paymentMethod ? ` · ${plan.paymentMethod.name}` : ""}</p>
        </div>
        {currentRow?.negativeAmortization && (
          <span className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">เงินต้นไม่ลด</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-gray-400">ยอดกู้</p>
          <p className="font-medium text-gray-800">{formatTHB(plan.principalAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">ระยะเวลา</p>
          <p className="font-medium text-gray-800">{(plan.termMonths / 12).toFixed(0)} ปี</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">อัตราปัจจุบัน</p>
          <p className="font-medium text-gray-800">{currentRow ? `${currentRow.annualRate.toFixed(3)}%` : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">ค่างวดปัจจุบัน</p>
          <p className="font-medium text-gray-800">{currentRow ? formatTHB(currentRow.payment + currentRow.extra) : "—"}</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>งวดที่ {plan.seededCount} จาก {totalInstallments}</span>
          <span>{progress.toFixed(0)}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </Link>
  );
}

export default function LoansPage() {
  const [plans, setPlans] = useState<LoanPlanDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  async function fetchPlans() {
    const data = await fetch("/api/loan-plans").then((r) => r.json());
    setPlans(data);
    setLoading(false);
  }

  useEffect(() => { fetchPlans(); }, []);

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">สินเชื่อบ้าน</h1>
        <button onClick={() => setShowForm(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
          + เพิ่มสินเชื่อ
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-400">
          ยังไม่มีสินเชื่อ — กด &ldquo;+ เพิ่มสินเชื่อ&rdquo; เพื่อเริ่มต้น
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.map((p) => <LoanCard key={p.id} plan={p} />)}
        </div>
      )}

      {showForm && (
        <LoanForm
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchPlans(); }}
        />
      )}
    </div>
  );
}
