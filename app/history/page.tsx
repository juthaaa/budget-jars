"use client";

import { useEffect, useState } from "react";
import { XAxis, YAxis, Tooltip, LineChart, Line, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatTHB, formatNum } from "@/lib/utils";

interface HistoryPoint {
  yearMonth: string;
  label: string;
  netIncome: number;
  totalExpenses: number;
}

export default function HistoryPage() {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history").then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 text-center text-gray-500">กำลังโหลด...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">ประวัติ & วิเคราะห์</h1>

      {/* Line chart: net income trend */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">แนวโน้มรายรับสุทธิ (ทุกเดือน)</h2>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={5} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => formatTHB(Number(v))} />
            <Line type="monotone" dataKey="netIncome" name="รายรับสุทธิ" stroke="#6366f1" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="totalExpenses" name="รายจ่าย" stroke="#f87171" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">ตารางสรุปรายเดือน</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">เดือน</th>
                <th className="text-right px-3 py-3">รายรับสุทธิ</th>
                <th className="text-right px-3 py-3">รายจ่าย</th>
                <th className="text-right px-3 py-3">คงเหลือ</th>
                <th className="text-right px-3 py-3">%ใช้</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...data].reverse().map((row) => {
                const balance = row.netIncome - row.totalExpenses;
                const pct = row.netIncome > 0 ? (row.totalExpenses / row.netIncome) * 100 : 0;
                return (
                  <tr key={row.yearMonth} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-800">{row.label}</td>
                    <td className="px-3 py-2.5 text-right text-gray-700">{formatNum(row.netIncome)}</td>
                    <td className="px-3 py-2.5 text-right text-red-500">{formatNum(row.totalExpenses)}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatNum(balance)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={`text-xs font-medium ${pct > 90 ? "text-red-500" : pct > 70 ? "text-yellow-500" : "text-green-500"}`}>
                        {pct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
